#!/usr/bin/env python3
"""Prepares the generated Xcode project (ios/ios/App) for the App Store build of Chairbook.

Run after `npx cap add ios` / `npx cap sync ios`. The ios/ios directory is regenerated in CI
on every run, so everything that differs from Capacitor's template is applied here, in one
place, and the script fails loudly if the template has changed shape.

  1. App icon      ios/icons/icon-1024.png (drawn by scripts/make-icon.py) -> AppIcon set, alpha channel removed (App Store rule).
                   The template otherwise ships Capacitor's own logo as the app icon.
  2. Launch screen Template splash (Capacitor logo) replaced with the app icon centred on the
                   app's blush background, so launch and first screen match.
  3. Info.plist    ITSAppUsesNonExemptEncryption = NO (no own encryption; skips the export
                   question on every upload). iPad orientation keys removed with the iPad target.
                   Dark status bar text, for the light background.
  4. Devices       iPhone only (TARGETED_DEVICE_FAMILY = 1). An iPad target would require 13-inch
                   iPad screenshots and an iPad layout review.
  5. Privacy       PrivacyInfo.xcprivacy added to the app target: no tracking, no data collected,
                   no required-reason APIs. Capacitor's frameworks carry their own manifests.
  6. iOS 15.0      Minimum iOS raised from Capacitor's 14.0 in the app target and the Podfile
                   (ITMS-90068: uploads must target iOS 15.0 or later from April 2027).
                   Run this script before `npx cap sync ios` so pod install picks up the Podfile.
"""
import os, plistlib, re, sys
from PIL import Image

IOS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # .../ios
ROOT = os.path.dirname(IOS)
APP = os.path.join(IOS, "ios", "App", "App")
PBX = os.path.join(IOS, "ios", "App", "App.xcodeproj", "project.pbxproj")
SPLASH_BG = (251, 244, 243)        # #FBF4F3, the app background (--blush)

def die(msg):
    sys.exit(f"native-setup: {msg}")

for p in (APP, PBX):
    if not os.path.exists(p):
        die(f"{p} not found; run `npx cap add ios` first")

# 1. App icon --------------------------------------------------------------------------
icon_dir = os.path.join(APP, "Assets.xcassets", "AppIcon.appiconset")
names = [f for f in os.listdir(icon_dir) if f.endswith(".png")]
if len(names) != 1:
    die(f"expected one PNG in AppIcon.appiconset, found {names}")
src = Image.open(os.path.join(IOS, "icons", "icon-1024.png"))
if src.size != (1024, 1024):
    die(f"ios/icons/icon-1024.png is {src.size}, expected 1024x1024")
flat = Image.new("RGB", src.size, (255, 255, 255))
flat.paste(src, mask=src.split()[-1] if src.mode in ("RGBA", "LA") else None)
flat.save(os.path.join(icon_dir, names[0]))

# 2. Launch screen ---------------------------------------------------------------------
splash_dir = os.path.join(APP, "Assets.xcassets", "Splash.imageset")
splash = Image.new("RGB", (2732, 2732), SPLASH_BG)
mark = flat.resize((360, 360), Image.LANCZOS)
splash.paste(mark, ((2732 - 360) // 2, (2732 - 360) // 2))
count = 0
for f in os.listdir(splash_dir):
    if f.endswith(".png"):
        splash.save(os.path.join(splash_dir, f)); count += 1
if count == 0:
    die("no splash images found in Splash.imageset")

# 3. Info.plist ------------------------------------------------------------------------
plist_path = os.path.join(APP, "Info.plist")
with open(plist_path, "rb") as fh:
    info = plistlib.load(fh)
info["ITSAppUsesNonExemptEncryption"] = False
info.pop("UISupportedInterfaceOrientations~ipad", None)
info["UIStatusBarStyle"] = "UIStatusBarStyleDarkContent"
info["UIViewControllerBasedStatusBarAppearance"] = False
with open(plist_path, "wb") as fh:
    plistlib.dump(info, fh)

# 4 + 5. Xcode project -----------------------------------------------------------------
pbx = open(PBX, encoding="utf-8").read()

n = len(re.findall(r'TARGETED_DEVICE_FAMILY = "1,2";', pbx))
if n == 0 and "TARGETED_DEVICE_FAMILY = 1;" not in pbx:
    die("TARGETED_DEVICE_FAMILY not found in project.pbxproj")
pbx = pbx.replace('TARGETED_DEVICE_FAMILY = "1,2";', "TARGETED_DEVICE_FAMILY = 1;")

MIN_IOS = "15.0"
pbx, n_ios = re.subn(r"IPHONEOS_DEPLOYMENT_TARGET = [0-9.]+;", f"IPHONEOS_DEPLOYMENT_TARGET = {MIN_IOS};", pbx)
if n_ios == 0:
    die("IPHONEOS_DEPLOYMENT_TARGET not found in project.pbxproj")
podfile = os.path.join(IOS, "ios", "App", "Podfile")
pod = open(podfile, encoding="utf-8").read()
pod, n_pod = re.subn(r"platform :ios, '[0-9.]+'", f"platform :ios, '{MIN_IOS}'", pod)
if n_pod != 1:
    die("platform :ios line not found in Podfile")
open(podfile, "w", encoding="utf-8").write(pod)

manifest = {
    "NSPrivacyTracking": False,
    "NSPrivacyTrackingDomains": [],
    "NSPrivacyCollectedDataTypes": [],
    "NSPrivacyAccessedAPITypes": [],
}
with open(os.path.join(APP, "PrivacyInfo.xcprivacy"), "wb") as fh:
    plistlib.dump(manifest, fh)

FILE_ID, BUILD_ID = "7A0C0FFEE0000000000000A1", "7A0C0FFEE0000000000000A2"
if FILE_ID not in pbx:
    anchor_ref = re.search(r"^\t\t(\w{24}) /\* Info\.plist \*/ = \{isa = PBXFileReference;[^\n]*\n", pbx, re.M)
    anchor_bld = re.search(r"^\t\t\w{24} /\* Assets\.xcassets in Resources \*/ = \{isa = PBXBuildFile;[^\n]*\n", pbx, re.M)
    res_phase = re.search(r"isa = PBXResourcesBuildPhase;.*?files = \(\n", pbx, re.S)
    if not (anchor_ref and anchor_bld and res_phase):
        die("Xcode template changed: could not find Info.plist / Assets / Resources entries")
    info_id = anchor_ref.group(1)
    group_line = re.search(rf"^(\t+){info_id} /\* Info\.plist \*/,\n", pbx, re.M)
    if not group_line:
        die("Info.plist not found in the App group")
    # insert from the end of the file backwards so earlier offsets stay valid
    edits = sorted([
        (anchor_ref.end(), f'\t\t{FILE_ID} /* PrivacyInfo.xcprivacy */ = {{isa = PBXFileReference; lastKnownFileType = text.xml; path = PrivacyInfo.xcprivacy; sourceTree = "<group>"; }};\n'),
        (anchor_bld.end(), f'\t\t{BUILD_ID} /* PrivacyInfo.xcprivacy in Resources */ = {{isa = PBXBuildFile; fileRef = {FILE_ID} /* PrivacyInfo.xcprivacy */; }};\n'),
        (group_line.end(), f"{group_line.group(1)}{FILE_ID} /* PrivacyInfo.xcprivacy */,\n"),
        (res_phase.end(), f"\t\t\t\t{BUILD_ID} /* PrivacyInfo.xcprivacy in Resources */,\n"),
    ], key=lambda e: e[0], reverse=True)
    for pos, text in edits:
        pbx = pbx[:pos] + text + pbx[pos:]

open(PBX, "w", encoding="utf-8").write(pbx)

# Checks ---------------------------------------------------------------------------------
pbx = open(PBX, encoding="utf-8").read()
assert pbx.count(FILE_ID) == 3 and pbx.count(BUILD_ID) == 2, "PrivacyInfo not wired into the project"
assert '"1,2"' not in pbx
assert re.findall(r"IPHONEOS_DEPLOYMENT_TARGET = ([0-9.]+);", pbx) and set(re.findall(r"IPHONEOS_DEPLOYMENT_TARGET = ([0-9.]+);", pbx)) == {MIN_IOS}
assert Image.open(os.path.join(icon_dir, names[0])).mode == "RGB"
print(f"native-setup: icon, {count} splash images, Info.plist, iPhone-only, PrivacyInfo.xcprivacy, iOS {MIN_IOS} done")
