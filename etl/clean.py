"""
ETL step 1 - CLEAN & NORMALISE the raw Amazon electronics CSV.

Input : the raw scrape (one row = one product card seen on one search page)
Output: data/clean/*.csv  - five normalised tables ready for PostgreSQL COPY

    categories(category_id, name)
    brands(brand_id, name)
    products(product_id, asin, title, brand_id, category_id, image_url, page_url)
    snapshots(snapshot_id, collected_at, snapshot_date)
    observations(obs_id, product_id, snapshot_id, ...)  <- the price history fact table

Usage:
    python etl/clean.py [path/to/raw.csv]
"""
import hashlib
import re
import sys
from collections import Counter
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_RAW = Path(r"C:\Users\aayus\Downloads\Data\amazon_products_sales_data_cleaned.csv")
OUT = ROOT / "data" / "clean"

# multi-word brands that a "first word" rule would otherwise split
MULTI_WORD_BRANDS = {   # key (lower-case, hyphens as spaces) -> display name
    "western digital": "Western Digital", "amazon basics": "Amazon Basics", "amazon fire": "Amazon Fire",
    "tp link": "TP-Link", "blue yeti": "Blue Yeti", "philips hue": "Philips Hue", "wd black": "WD Black",
    "texas instruments": "Texas Instruments", "lian li": "Lian Li", "be quiet": "be quiet!",
    "kate spade": "Kate Spade", "cooler master": "Cooler Master", "tripp lite": "Tripp Lite",
    "nite ize": "Nite Ize", "turtle beach": "Turtle Beach", "klein tools": "Klein Tools",
    "melissa &": "Melissa & Doug", "e z": "E-Z",
}
# first tokens that are not brands
STOP_TOKENS = {"the", "new", "for", "replacement", "universal", "pack", "set", "kit", "usb", "wireless",
               "bluetooth", "smart", "portable", "digital", "original", "genuine", "compatible", "2",
               "1", "3", "4", "5", "6", "10", "(renewed)", "renewed", "refurbished", "a", "an", "with",
               "premium", "professional", "ultra", "mini", "older", "mounting", "ultimate", "2-pack", "3-pack", "4-pack", "5-pack",
               "6-pack", "10-pack", "[2", "[3", "[4", "(2", "(3", "(4"}


def fix_encoding(s: str) -> str:
    """The scrape contains U+FFFD where an apostrophe / dash / trademark symbol used to be."""
    if not isinstance(s, str):
        return s
    s = re.sub(r"\bR�DE\b", "RØDE", s)             # the brand RØDE
    s = re.sub(r"(?<=[A-Za-z])\ufffd(?=[A-Za-z])", "'", s)   # Kid�s  -> Kid's
    s = re.sub(r"\s\ufffd\s", " - ", s)                      # Camera � 1080p -> Camera - 1080p
    s = s.replace("\ufffd", "")
    return re.sub(r"\s{2,}", " ", s).strip()


def extract_asin(url) -> str | None:
    if not isinstance(url, str):
        return None
    m = re.search(r"/dp/([A-Z0-9]{10})", url) or re.search(r"dp%2F([A-Z0-9]{10})", url)
    return m.group(1) if m else None


def brand_of(title: str) -> str | None:
    t = re.sub(r"^[\[\(]?\s*", "", title)
    low = re.sub(r"[-_]", " ", t.lower())
    for mw in MULTI_WORD_BRANDS:
        if low.startswith(mw):
            return mw
    first = re.split(r"[\s,]", t, maxsplit=1)[0].strip("[]()™®")
    low1 = first.lower()
    if (not first) or low1 in STOP_TOKENS or re.match(r"^\d", first) or len(first) < 2:
        return None
    return low1


def clean_badge(v: str) -> tuple[str, bool]:
    """'is_best_seller' is really the product badge. Normalise it."""
    v = (v or "").strip()
    if v == "Best Seller":
        return "Best Seller", True
    if v == "Amazon's":
        return "Amazon's Choice", False
    if v in ("Limited time deal", "Ends in"):
        return "Limited Time Deal", False
    if v.startswith("Save"):
        return "Percent-Off Deal", False
    return "None", False


def parse_coupon(v: str):
    """'Save 15%  with coupon' -> ('percent', 15) ; 'Save $16.00  with coupon' -> ('amount', 16)"""
    if not isinstance(v, str) or v.startswith("No Coupon"):
        return None, None
    m = re.search(r"Save\s+\$([\d.,]+)", v)
    if m:
        return "amount", float(m.group(1).replace(",", ""))
    m = re.search(r"Save\s+([\d.]+)%", v)
    if m:
        return "percent", float(m.group(1))
    return None, None


def main(raw_path: Path):
    print(f"Reading {raw_path} ...")
    df = pd.read_csv(raw_path)
    n_raw = len(df)

    # ---------- 1. text clean-up ----------
    df["product_title"] = df["product_title"].map(fix_encoding)
    df = df[df["product_title"].str.len() > 0].copy()

    # ---------- 2. product identity (ASIN) ----------
    df["asin"] = df["product_page_url"].map(extract_asin)
    # rows with no usable URL: borrow the ASIN from another row with the same title
    title_to_asin = (df.dropna(subset=["asin"]).groupby("product_title")["asin"]
                     .agg(lambda s: s.value_counts().index[0]))
    df["asin"] = df["asin"].fillna(df["product_title"].map(title_to_asin))
    # still nothing -> deterministic synthetic key from the title
    missing = df["asin"].isna()
    df.loc[missing, "asin"] = "H_" + df.loc[missing, "product_title"].map(
        lambda t: hashlib.md5(t.encode()).hexdigest()[:9].upper())
    print(f"  products identified: {df['asin'].nunique():,} "
          f"({missing.sum():,} rows keyed by title hash)")

    # ---------- 3. typed / normalised measures ----------
    df["collected_at"] = pd.to_datetime(df["data_collected_at"])
    df["snapshot_date"] = df["collected_at"].dt.date
    df["current_price"] = df["discounted_price"].round(2)
    df["list_price"] = df["original_price"].round(2)
    # a list price lower than the selling price is meaningless -> raise it to the selling price
    bad = df["list_price"] < df["current_price"]
    df.loc[bad, "list_price"] = df.loc[bad, "current_price"]
    df["discount_pct"] = ((df["list_price"] - df["current_price"]) / df["list_price"] * 100).round(2)
    df["rating"] = df["product_rating"]
    df["review_count"] = df["total_reviews"].astype("Int64")
    df["purchased_last_month"] = df["purchased_last_month"].astype("Int64")
    badge = df["is_best_seller"].map(clean_badge)
    df["badge"] = badge.map(lambda x: x[0])
    df["is_best_seller"] = badge.map(lambda x: x[1])
    df["is_sponsored"] = df["is_sponsored"].eq("Sponsored")
    cp = df["has_coupon"].map(parse_coupon)
    df["coupon_type"] = cp.map(lambda x: x[0])
    df["coupon_value"] = cp.map(lambda x: x[1])
    df["buy_box_available"] = df["buy_box_availability"].notna()
    df["delivery_date"] = pd.to_datetime(df["delivery_date"], errors="coerce").dt.date
    df["sustainability_tag"] = (df["sustainability_tags"].astype("string")
                                .str.replace(r"\s*\+\d+ more$", "", regex=True))

    # ---------- 4. drop exact re-observations ----------
    before = len(df)
    df = df.drop_duplicates(subset=["asin", "collected_at"], keep="first")
    print(f"  dropped {before - len(df)} duplicate (product, timestamp) rows")

    # ---------- 5. dimension tables ----------
    # brands: canonical spelling = most frequent surface form of the first token
    df["_brand_key"] = df["product_title"].map(brand_of)
    surface = {}
    for title, key in zip(df["product_title"], df["_brand_key"]):
        if key:
            first = re.split(r"\s+", re.sub(r"^[\[\(]?\s*", "", title))[0].strip("[]()™®,")
            if key in MULTI_WORD_BRANDS:
                first = MULTI_WORD_BRANDS[key]
            surface.setdefault(key, Counter())[first] += 1
    def pick(c: Counter) -> str:
        # prefer 'Samsung' over 'SAMSUNG' when both spellings are common
        mixed = [(n, f) for f, n in c.items() if not f.isupper()]
        if mixed and max(mixed)[0] >= 0.25 * sum(c.values()):
            return max(mixed)[1]
        return c.most_common(1)[0][0]
    canon = {k: pick(c) for k, c in surface.items()}
    # a brand must appear on >= 3 distinct products, otherwise it is probably noise
    prod_per_brand = df.dropna(subset=["_brand_key"]).groupby("_brand_key")["asin"].nunique()
    valid = set(prod_per_brand[prod_per_brand >= 3].index)
    df["brand"] = df["_brand_key"].map(lambda k: canon[k] if k in valid else "Other / Unbranded")

    categories = pd.DataFrame({"name": sorted(df["product_category"].unique())})
    categories.insert(0, "category_id", range(1, len(categories) + 1))
    brands = pd.DataFrame({"name": sorted(df["brand"].unique())})
    brands.insert(0, "brand_id", range(1, len(brands) + 1))

    snaps = (df.groupby("collected_at").size().rename("n").reset_index()
             .sort_values("collected_at").reset_index(drop=True))
    snaps["snapshot_id"] = snaps.index + 1
    snaps["snapshot_date"] = snaps["collected_at"].dt.date
    snapshots = snaps[["snapshot_id", "collected_at", "snapshot_date"]]

    # ---------- 6. products ----------
    df = df.sort_values("collected_at")
    first = df.groupby("asin").first()          # earliest observation = canonical attributes
    last_img = df.dropna(subset=["product_image_url"]).groupby("asin")["product_image_url"].last()
    products = pd.DataFrame({
        "asin": first.index,
        "title": first["product_title"].values,
        "brand": first["brand"].values,
        "category": first["product_category"].values,
    })
    products["image_url"] = products["asin"].map(last_img)
    products["page_url"] = products["asin"].map(
        lambda a: None if a.startswith("H_") else f"https://www.amazon.com/dp/{a}")
    products = products.merge(brands.rename(columns={"name": "brand"}), on="brand") \
                       .merge(categories.rename(columns={"name": "category"}), on="category")
    products = products.sort_values("asin").reset_index(drop=True)
    products.insert(0, "product_id", products.index + 1)
    products = products[["product_id", "asin", "title", "brand_id", "category_id", "image_url", "page_url"]]

    # ---------- 7. observations (fact table) ----------
    df = df.merge(products[["product_id", "asin"]], on="asin") \
           .merge(snapshots[["snapshot_id", "collected_at"]], on="collected_at")
    df = df.sort_values(["collected_at", "product_id"]).reset_index(drop=True)
    df.insert(0, "obs_id", df.index + 1)
    obs = df[["obs_id", "product_id", "snapshot_id", "current_price", "list_price", "discount_pct",
              "rating", "review_count", "purchased_last_month", "badge", "is_best_seller",
              "is_sponsored", "coupon_type", "coupon_value", "buy_box_available",
              "delivery_date", "sustainability_tag"]]

    OUT.mkdir(parents=True, exist_ok=True)
    for name, frame in [("categories", categories), ("brands", brands), ("products", products),
                        ("snapshots", snapshots), ("observations", obs)]:
        frame.to_csv(OUT / f"{name}.csv", index=False)
        print(f"  wrote {name}.csv  {len(frame):>7,} rows")

    print(f"\nSummary: {n_raw:,} raw rows -> {len(obs):,} observations, {len(products):,} products, "
          f"{len(brands)} brands, {len(categories)} categories, {len(snapshots)} snapshots")
    print("Top brands:", ", ".join(f"{b}({n})" for b, n in
                                    df["brand"].value_counts().head(12).items()))


if __name__ == "__main__":
    main(Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_RAW)

