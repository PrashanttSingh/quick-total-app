import os
import glob

TRAIN = "Raw_Datasets/SROIE_Receipts/SROIE2019/train"

# Check what text files actually exist
txt_files = glob.glob(os.path.join(TRAIN, "**", "*.txt"), recursive=True)
print("Total .txt files found:", len(txt_files))
if txt_files:
    print("Example:", txt_files[0])
    print("Example:", txt_files[1] if len(txt_files) > 1 else "")