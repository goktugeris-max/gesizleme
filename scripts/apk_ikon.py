"""Android başlatıcı simgesini icon-512.png'den üretir (APK iş akışı kullanır)."""
import os, sys
from PIL import Image
res = sys.argv[1]  # android/app/src/main/res
boy = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
src = Image.open("icon-512.png").convert("RGB")
for d, n in boy.items():
    kl = os.path.join(res, "mipmap-" + d)
    os.makedirs(kl, exist_ok=True)
    for ad in ("ic_launcher.png", "ic_launcher_round.png", "ic_launcher_foreground.png"):
        src.resize((n, n), Image.LANCZOS).save(os.path.join(kl, ad))
import shutil
shutil.rmtree(os.path.join(res, "mipmap-anydpi-v26"), ignore_errors=True)
