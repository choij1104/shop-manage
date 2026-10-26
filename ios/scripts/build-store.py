#!/usr/bin/env python3
"""Builds ios/www, the App Store build of Chairbook, from the repository's index.html.

The web app in the repository root is not modified. The App Store build differs in these ways:

  1. Name: the app is published as "Chairbook" (decision 2026-10-06). Title, file names of
     exports and backups, and the CSV import message say Chairbook. The sample name in the
     "your name" field is a neutral placeholder.
  2. Fonts: Manrope is bundled from @fontsource (SIL OFL 1.1) instead of Fraunces/Karla from
     Google Fonts, so the app makes no network request and has its own type.
  3. Saving files: an <a download> link does nothing inside an iOS app. CSV export and the
     JSON backup go through saveFile(), which writes the file to the app cache and opens the
     iOS share sheet (Save to Files, Mail, AirDrop). In a browser it falls back to the download.
  4. Data storage is unchanged (localStorage key salon_studio_v1), so the data model and the
     CSV and backup formats stay identical to the web app (the iPhone app only adds optional fields).
  5. iPhone interface and native features (version 1.1): src/chairbook.css re-themes every screen
     (graphite and champagne, capsule dock), src/chairbook-native.js redraws Today as a day rail and
     connects the Swift plugins in ios/native (reminders, Add to Calendar, Siri and Shortcuts,
     haptics). Both are loaded after the app's own style and script.

Every text replacement must match exactly once, or the build fails.
Run `npm install` in ios/ first so the @fontsource packages are present.
"""
import os, re, shutil, sys

IOS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(IOS)
OUT = os.path.join(IOS, "www")
FS = os.path.join(IOS, "node_modules", "@fontsource")

def die(msg):
    sys.exit(f"build-store: {msg}")

def sub1(old, new, s, what):
    n = s.count(old)
    if n != 1:
        die(f"{what}: expected 1 match, found {n}")
    return s.replace(old, new)

t = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()

# 1. Name -------------------------------------------------------------------------------
t = sub1("<title>Salon Studio</title>", "<title>Chairbook</title>", t, "title")
t = sub1("Salon Studio — solo stylist booking & earnings", "Chairbook — solo stylist booking & earnings", t, "header comment")
t = sub1("toast('Not a Salon Studio CSV')", "toast('Not a Chairbook CSV')", t, "CSV import message")
# Name placeholder and the web app's pre-rename storage key carry a personal name; the store build
# ships neither (a fresh App Store install has no pre-rename data to migrate).
ph = re.findall(r'placeholder="e\.g\. [A-Z][a-z]+"', t)
if len(ph) != 1:
    die(f"name placeholder: expected 1, found {len(ph)}")
LEGACY_NAME = ph[0].split(" ")[1].rstrip('"')
t = t.replace(ph[0], 'placeholder="e.g. Alex"')
legacy = re.findall(r"const LS_LEGACY='[^']*';", t)
if len(legacy) != 1:
    die("legacy storage key line not found")
t = t.replace(legacy[0], "const LS_LEGACY='';")
t = sub1('<meta charset="UTF-8">', '<meta charset="UTF-8">\n<meta name="chairbook-build" content="store">', t, "charset meta")

# 2. Fonts ------------------------------------------------------------------------------
if not os.path.isdir(os.path.join(FS, "manrope", "files")):
    die("@fontsource/manrope missing: run npm install in ios/ first")
n_f = t.count("'Fraunces',serif"); n_k = t.count("'Karla',system-ui,sans-serif")
if n_f < 5 or n_k != 1:
    die(f"font families: found {n_f} Fraunces and {n_k} Karla references")
t = t.replace("'Fraunces',serif", "'Manrope',system-ui,sans-serif").replace("'Karla',system-ui,sans-serif", "'Manrope',system-ui,sans-serif")
t = sub1('<link rel="preconnect" href="https://fonts.googleapis.com">\n', "", t, "font preconnect")
gf = re.findall(r'<link href="https://fonts\.googleapis\.com/css2[^"]*" rel="stylesheet">', t)
if len(gf) != 1:
    die(f"Google Fonts stylesheet link: expected 1, found {len(gf)}")
t = t.replace(gf[0], '<link rel="stylesheet" href="fonts/fonts.css">')

t = sub1('<meta name="theme-color" content="#33222C">', '<meta name="theme-color" content="#111316">', t, "theme color")

# 5. iPhone interface ---------------------------------------------------------------------
NAV_OLD = re.search(r"  <nav>\n.*?  </nav>\n", t, re.S)
if not NAV_OLD or t.count("<nav>") != 1:
    die("tab bar markup not found")
NAV = """  <nav aria-label="Sections">
    <div class="nav-in">
      <button data-v="today" class="on"><svg viewBox="0 0 24 24"><path d="M5 4v16"/><circle cx="5" cy="8" r="1.6"/><circle cx="5" cy="16" r="1.6"/><path d="M9 8h10M9 16h7"/></svg>Today</button>
      <button data-v="cal"><svg viewBox="0 0 24 24"><rect x="3.5" y="4.5" width="17" height="16" rx="4"/><path d="M3.5 9.5h17M8.5 2.5v4M15.5 2.5v4"/><path d="M8 14h2M14 14h2M8 17h2"/></svg>Calendar</button>
      <button data-v="clients"><svg viewBox="0 0 24 24"><circle cx="9" cy="8.5" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M16 5.2a3.4 3.4 0 0 1 0 6.6M18.5 14.8c1.7.7 2.8 2.4 3 5.2"/></svg>Clients</button>
      <button data-v="earn"><svg viewBox="0 0 24 24"><path d="M12 3v18"/><path d="M16.5 7.5c-.6-1.5-2.3-2.5-4.5-2.5-2.6 0-4.5 1.3-4.5 3.4 0 4.8 9.5 2.4 9.5 7.2 0 2.1-2 3.4-5 3.4-2.4 0-4.2-1-4.9-2.7"/></svg>Money</button>
    </div>
  </nav>
"""
t = t[:NAV_OLD.start()] + NAV + t[NAV_OLD.end():]
t = sub1('aria-label="New appointment">+</button>', 'aria-label="New appointment">+</button>', t, "book button")
t = sub1("</style>\n</head>", '</style>\n<link rel="stylesheet" href="chairbook.css">\n</head>', t, "theme stylesheet")
t = sub1("</script>\n</body>", '</script>\n<script src="chairbook-native.js"></script>\n</body>', t, "native layer")

# 3. Saving files -----------------------------------------------------------------------
SAVE_FILE = r"""
/* Store build: save a file. In the iOS app, write it to the cache and open the share sheet
   (Save to Files, Mail, AirDrop); in a browser, fall back to a normal download. */
async function saveFile(name,text,mime){
  const C=window.Capacitor;
  if(C&&C.isNativePlatform&&C.isNativePlatform()){
    try{
      const Filesystem=C.registerPlugin('Filesystem'),Share=C.registerPlugin('Share');
      const r=await Filesystem.writeFile({path:name,data:text,directory:'CACHE',encoding:'utf8'});
      await Share.share({title:name,files:[r.uri]});
      return true;
    }catch(e){
      if(e&&/cancel/i.test(String(e.message||e)))return false;
      toast('Could not save the file');return false;
    }
  }
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([text],{type:mime}));
  a.download=name;a.click();URL.revokeObjectURL(a.href);
  return true;
}
"""
t = sub1("const uid=()=>", SAVE_FILE.lstrip("\n") + "const uid=()=>", t, "saveFile insertion point")

t = sub1("""  const blob=new Blob(['\\ufeff'+buildCSV()],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='salon-studio-'+todayStr()+'.csv';
  a.click();URL.revokeObjectURL(a.href);
  toast('CSV downloaded');""",
"""  saveFile('chairbook-'+todayStr()+'.csv','\\ufeff'+buildCSV(),'text/csv;charset=utf-8')
    .then(ok=>{if(ok)toast('CSV ready');});""", t, "CSV export")
t = sub1("""    const blob=new Blob([JSON.stringify(db,null,2)],{type:'application/json'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download='salon-studio-backup-'+todayStr()+'.json';
    a.click();URL.revokeObjectURL(a.href);toast('Backup downloaded');""",
"""    saveFile('chairbook-backup-'+todayStr()+'.json',JSON.stringify(db,null,2),'application/json')
      .then(ok=>{if(ok)toast('Backup ready');});""", t, "JSON backup")

# Checks --------------------------------------------------------------------------------
for bad in ("Salon Studio", LEGACY_NAME, LEGACY_NAME.lower(), "salon-studio-", "fonts.googleapis", "fonts.gstatic"):
    if bad in t:
        die(f"'{bad}' still present")
if t.count("a.download=") != 1:
    die("unexpected <a download> outside saveFile()")
if re.search(r'(src|href)="https?://', t):
    die("external resource reference in index.html")

shutil.rmtree(OUT, ignore_errors=True)
os.makedirs(os.path.join(OUT, "fonts"))
open(os.path.join(OUT, "index.html"), "w", encoding="utf-8").write(t)
for f in ("chairbook.css", "chairbook-native.js"):
    src_f = open(os.path.join(IOS, "src", f), encoding="utf-8").read()
    for bad in ("http://", "https://", "fetch(", "XMLHttpRequest"):
        if bad in src_f:
            die(f"src/{f} contains '{bad}'; the app makes no network requests")
    shutil.copy(os.path.join(IOS, "src", f), os.path.join(OUT, f))

# Fonts: @fontsource's own per-weight CSS keeps each subset's unicode-range; woff2 only.
want = {"manrope": [400, 500, 600, 700, 800]}
css = []
for pkg, weights in want.items():
    for w in weights:
        src = open(os.path.join(FS, pkg, f"{w}.css"), encoding="utf-8").read()
        src = re.sub(r",\s*url\([^)]*\.woff\) format\('woff'\)", "", src)
        for f in re.findall(r"url\(\./files/([^)]+\.woff2)\)", src):
            shutil.copy(os.path.join(FS, pkg, "files", f), os.path.join(OUT, "fonts", f))
        css.append(src.replace("url(./files/", "url("))
open(os.path.join(OUT, "fonts", "fonts.css"), "w", encoding="utf-8").write("\n".join(css))
shutil.copy(os.path.join(FS, "manrope", "LICENSE"), os.path.join(OUT, "fonts", "OFL-Manrope.txt"))
n_fonts = len([f for f in os.listdir(os.path.join(OUT, "fonts")) if f.endswith(".woff2")])
print(f"build-store: Chairbook written to {OUT} ({len(t)} bytes, {n_fonts} font files)")

# Capacitor JS runtime -------------------------------------------------------------------
# The native bridge injected by Capacitor iOS provides isNativePlatform() and nativePromise()
# but not registerPlugin(); that comes from @capacitor/core. Ship its browser build and load it
# before any app script, so Capacitor.registerPlugin() works in the app.
_src = os.path.join(IOS, "node_modules", "@capacitor", "core", "dist", "capacitor.js")
if not os.path.isfile(_src):
    die("@capacitor/core dist/capacitor.js missing: run npm install in ios/ first")
shutil.copy(_src, os.path.join(OUT, "capacitor.js"))
_index = os.path.join(OUT, "index.html")
_html = open(_index, encoding="utf-8").read()
_i = _html.find("<script")
if _i < 0:
    die("no <script> tag to load capacitor.js before")
_html = _html[:_i] + '<script src="capacitor.js"></script>\n' + _html[_i:]
open(_index, "w", encoding="utf-8").write(_html)
print("build-store: capacitor.js bundled and loaded before the app scripts")
