import os
import glob
import json
import re
import zipfile
import csv

RETAIL_IMAGES_DIR = "Raw_Datasets/Retail_Receipts/images"
RETAIL_BOXES_DIR = "Raw_Datasets/Retail_Receipts/boxes"
RETAIL_CSV = "Raw_Datasets/Retail_Receipts/receipts.csv"
RETAIL_XML = "Raw_Datasets/Retail_Receipts/annotations.xml"
OUTPUT_JSONL = "stage1_retail.jsonl"
OUTPUT_ZIP = "stage1_retail.zip"

PROMPT = (
    "You are an expert OCR AI for receipts."
    " Read this receipt image carefully."
    " Extract the store name, date, all items with prices, and the total."
    " Output ONLY raw JSON in this exact format:"
    ' {"store": "store name", "date": "DD/MM/YYYY",'
    ' "items": [{"item": "product name", "amount": 0.00}], "total": 0.00}'
    " No markdown. No explanation. Raw JSON only."
)


def find_images(folder):
    results = []
    for ext in ["*.jpg", "*.jpeg", "*.png", "*.JPG", "*.JPEG", "*.PNG"]:
        results.extend(glob.glob(os.path.join(folder, "**", ext), recursive=True))
        results.extend(glob.glob(os.path.join(folder, ext)))
    return list(set(results))


def parse_xml(xml_path):
    text_by_image = {}
    try:
        import xml.etree.ElementTree as ET
        tree = ET.parse(xml_path)
        root = tree.getroot()
        for image_elem in root.findall(".//image"):
            name = image_elem.get("name", "")
            texts = []
            for elem in image_elem.iter():
                val = (elem.text or "").strip()
                if val:
                    texts.append(val)
            if name:
                text_by_image[name] = texts
        if not text_by_image:
            for elem in root.iter():
                name = elem.get("filename") or elem.get("name") or ""
                if name and ("jpg" in name or "png" in name):
                    texts = [(t.strip()) for t in elem.itertext() if t.strip()]
                    text_by_image[name] = texts
    except Exception as e:
        print("XML parse error: " + str(e))
    return text_by_image


def texts_to_json(text_lines, img_name):
    items = []
    total = 0.0
    store = text_lines[0] if text_lines else "Retail Store"
    date = ""
    for line in text_lines:
        date_match = re.search(r"\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}", line)
        if date_match and len(line) < 20:
            date = line
            continue
        price_match = re.search(r"(\d+\.\d{2})", line)
        if price_match:
            amount = float(price_match.group(1))
            item_name = re.sub(r"(\d+\.\d{2})", "", line).strip()
            if item_name and len(item_name) > 1:
                total = amount
                items.append({"item": item_name, "amount": amount})
    if len(items) > 1:
        items = items[:-1]
    return {"store": store, "date": date, "items": items, "total": total}


def main():
    print("BUILDING RETAIL DATASET")
    print("=" * 50)

    if not os.path.exists(RETAIL_IMAGES_DIR):
        print("ERROR: images folder not found: " + RETAIL_IMAGES_DIR)
        return

    images = find_images(RETAIL_IMAGES_DIR)
    print("images/ folder: " + str(len(images)) + " images found")

    text_by_image = {}
    if os.path.exists(RETAIL_XML):
        print("Parsing annotations.xml ...")
        text_by_image = parse_xml(RETAIL_XML)
        print("XML entries loaded: " + str(len(text_by_image)))
    else:
        print("No annotations.xml found - will create empty ground truth")

    records = []
    skipped = 0

    for img_path in sorted(images):
        img_filename = os.path.basename(img_path)
        base = os.path.splitext(img_filename)[0]

        text_lines = (
            text_by_image.get(img_filename) or
            text_by_image.get(base) or
            []
        )

        ground_truth = texts_to_json(text_lines, img_filename)

        record = {
            "id": "retail_" + base,
            "conversations": [
                {
                    "role": "user",
                    "value": "<img>" + img_filename + "</img>\n" + PROMPT
                },
                {
                    "role": "assistant",
                    "value": json.dumps(ground_truth, ensure_ascii=False, indent=2)
                }
            ],
            "_abs": img_path
        }
        records.append(record)
        print("OK: " + base)

    if not records:
        print("NO RECORDS BUILT.")
        return

    with open(OUTPUT_JSONL, "w", encoding="utf-8") as f:
        for r in records:
            clean = {}
            for k, v in r.items():
                if not k.startswith("_"):
                    clean[k] = v
            f.write(json.dumps(clean, ensure_ascii=False) + "\n")

    seen = set()
    with zipfile.ZipFile(OUTPUT_ZIP, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.write(OUTPUT_JSONL, OUTPUT_JSONL)
        for r in records:
            ip = r.get("_abs", "")
            if ip and os.path.exists(ip):
                fname = os.path.basename(ip)
                if fname not in seen:
                    zf.write(ip, "images/" + fname)
                    seen.add(fname)

    print("=" * 50)
    print("DONE!")
    print("Records : " + str(len(records)))
    print("Skipped : " + str(skipped))
    print("JSONL   : " + OUTPUT_JSONL)
    print("ZIP     : " + OUTPUT_ZIP)
    print("=" * 50)


if __name__ == "__main__":
    main()