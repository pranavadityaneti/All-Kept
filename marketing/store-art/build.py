#!/usr/bin/env python3
"""Allkept store artwork, final set.

Composes every frame as an HTML/CSS page (real Manrope shaping and kerning, anti-aliased
shapes, true gradients and shadows) and renders it with the system Chrome at the exact pixel
size. PIL only prepares the bitmaps (cut-outs, exact-size screens) and writes the final files.

usage: python3 build.py [format ...] [--only frame-id ...] [--final]
Without --final the frames go to a preview folder in the scratch directory; with it, to
docs/marketing/store/final. Needs Pillow, Node, Google Chrome and Playwright (set
PLAYWRIGHT_PATH to its folder if it is not installed here); see README.md.
"""
import json, os, subprocess, sys, tempfile
from PIL import Image, ImageCms, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))     # marketing/store-art
ROOT = os.path.dirname(os.path.dirname(HERE))
RAW = f"{ROOT}/docs/marketing/store/raw"
BRAND = f"{ROOT}/docs/marketing/creative-assets/brand"
FONTS = f"{ROOT}/node_modules/@expo-google-fonts/manrope"
# Scratch: cut-outs, pages, renders and previews. Kept out of the repo.
WORK = os.environ.get("STORE_ART_WORK") or os.path.join(tempfile.gettempdir(), "allkept-store-art")
ASSETS, HTMLD, RENDER = f"{WORK}/assets", f"{WORK}/html", f"{WORK}/render"
FINAL = f"{ROOT}/docs/marketing/store/final"
PREVIEW = f"{WORK}/preview"
for d in (ASSETS, HTMLD, RENDER):
    os.makedirs(d, exist_ok=True)

RAW_W, RAW_H = 1320, 2868          # every raw screen is an iPhone 6.9" capture
STATUS_ROWS = 176                  # rows 0..175 hold the iOS status bar + island (content starts at 186)

# Play listings get an Android status bar and a generic Android phone instead of the iOS chrome.
ANDROID_CHROME_ON_PLAY = True

INK = "#15112B"
VIOLET = "#6D46F2"

# ---------------------------------------------------------------------------------------------
# Frames. Order = store order. bg: the solid colour. fg: caption colour. shadow: phone shadow tint.
FRAMES = [
    dict(id="1-hero", kind="hero",
         caption=["Everything", "you save.", "Kept together."]),
    dict(id="2-sorted", screen="2-home-categories.png", bg="#6D46F2", fg="#FFFFFF",
         shadow=(30, 12, 96), shadow_a=0.50, caption=["Sorted for you,", "automatically"]),
    dict(id="3-search", screen="3-search.png", bg="#FFC83D", fg=INK,
         shadow=(122, 74, 0), shadow_a=0.36, caption=["Find any save", "in seconds"]),
    dict(id="4-share", screen="5-paste-a-link.png", bg="#F4593A", fg="#FFFFFF",
         shadow=(110, 24, 8), shadow_a=0.45, caption=["Save from", "any app"],
         layout="callout", patch=(24, 677, 1296, 1061), zoom=1.17),
    dict(id="5-details", screen="4-save-details.png", bg="#DE4597", fg="#FFFFFF",
         shadow=(92, 8, 52), shadow_a=0.48, caption=["Add a note.", "Get a summary."],
         layout="duo", back="2-home-categories.png", content_end=1909),
    dict(id="6-library", screen="1-library.png", bg="#2B1C7E", fg="#FFFFFF",
         shadow=(6, 2, 26), shadow_a=0.65, caption=["Every save,", "in one library"]),
]

FORMATS = {
    "appstore-6.9": dict(W=1320, H=2868, platform="ios", aspect="tall"),
    "appstore-6.5": dict(W=1284, H=2778, platform="ios", aspect="tall"),
    "play-phone":   dict(W=1080, H=1920, platform="android", aspect="wide"),
    "play-tablet":  dict(W=1440, H=2560, platform="android", aspect="wide", tablet=True),
}

# ---------------------------------------------------------------------------------------------
# Bitmaps

def raw(name):
    im = Image.open(f"{RAW}/{name}")
    if im.mode == "RGBA":
        a = im.getchannel("A")
        assert a.getextrema() == (255, 255), f"{name} has real transparency"
    return im.convert("RGB")

def clean_battery(im):
    """The simulator captures show a charging battery (green, with a bolt). Redraw it as a plain
    full battery in the iOS light style. Status-bar chrome only; the app UI is untouched."""
    box = (1100, 68, 1204, 124)                     # the glyph sits at x 1105..1197, y 74..118
    band = im.getpixel((1250, 96))                  # flat status-band colour right of the glyph
    S = 4
    w, h = box[2] - box[0], box[3] - box[1]
    big = Image.new("RGBA", (w * S, h * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    R = lambda x0, y0, x1, y1: ((x0 - box[0]) * S, (y0 - box[1]) * S, (x1 - box[0]) * S, (y1 - box[1]) * S)
    d.rounded_rectangle(R(1106, 75, 1189, 118), radius=13 * S, outline=(0, 0, 0, 92), width=3 * S)
    d.rounded_rectangle(R(1112, 81, 1183, 112), radius=8 * S, fill=(0, 0, 0, 255))
    d.rounded_rectangle(R(1192, 89, 1197, 104), radius=2 * S, fill=(0, 0, 0, 100))
    patch = Image.new("RGBA", (w, h), band + (255,))
    patch.alpha_composite(big.resize((w, h), Image.LANCZOS))
    im.paste(patch.convert("RGB"), box[:2])
    return im

def prep_screen(name, sw, sh, android):
    out = f"{ASSETS}/screen-{name[:-4]}-{sw}x{sh}{'-a' if android else '-i'}.png"
    if os.path.exists(out):
        return out
    im = raw(name)
    if android:
        # Clear the iOS status bar and island; the band is a flat colour on every screen.
        band = im.crop((0, 0, RAW_W, STATUS_ROWS))
        colours = band.getcolors(1 << 16)
        top = max(colours)[1]
        im.paste(top, (0, 0, RAW_W, STATUS_ROWS))
    else:
        im = clean_battery(im)
    im.resize((sw, sh), Image.LANCZOS).save(out)
    return out

CARDS = {   # crop boxes measured from the raw screens: 1 px border, 54 px corner radius
    "wave":    ("1-library.png", (48, 534, 636, 1400)),
    "lilies":  ("1-library.png", (48, 1436, 636, 2302)),
    "artemis": ("1-library.png", (684, 1436, 1272, 2302)),
    "saturn":  ("3-search.png", (48, 558, 636, 1358)),
    "aurora":  ("3-search.png", (684, 558, 1272, 1358)),
    "pillars": ("3-search.png", (48, 1394, 636, 2260)),
    "jwst":    ("3-search.png", (684, 1394, 1272, 2260)),
    "mirror":  ("3-search.png", (48, 2296, 636, 2868)),    # partial: only ever shown running off the bottom
}
CARD_RADIUS = 54

def prep_card(key, cw):
    src, box = CARDS[key]
    w, h = box[2] - box[0], box[3] - box[1]
    if key == "mirror":
        h = 866                       # same grid row height as the full cards; the bitmap stops at 572
    ch = round(h * cw / w)
    out = f"{ASSETS}/card-{key}-{cw}.png"
    if not os.path.exists(out):
        im = raw(src).crop(box)
        im = im.resize((cw, round(im.height * cw / w)), Image.LANCZOS)
        im.save(out)
    return out, cw, ch, CARD_RADIUS * cw / w

def prep_patch(name, box, w):
    out = f"{ASSETS}/patch-{name[:-4]}-{box[0]}-{box[1]}-{w}.png"
    bw, bh = box[2] - box[0], box[3] - box[1]
    h = round(bh * w / bw)
    if not os.path.exists(out):
        raw(name).crop(box).resize((w, h), Image.LANCZOS).save(out)
    return out, w, h

def prep_lockup(h):
    out = f"{ASSETS}/lockup-{h}.png"
    if not os.path.exists(out):
        im = Image.open(f"{BRAND}/allkept-horizontal.png").convert("RGBA")
        im = im.crop(im.getbbox())
        w = round(im.width * h / im.height)
        im.resize((w, h), Image.LANCZOS).save(out)
    im = Image.open(out)
    return out, im.width, im.height

# ---------------------------------------------------------------------------------------------
# HTML pieces

def page(W, H, body, css="", bg="#fff"):
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{{font-family:Manrope;font-weight:800;src:url("file://{FONTS}/800ExtraBold/Manrope_800ExtraBold.ttf")}}
@font-face{{font-family:Manrope;font-weight:700;src:url("file://{FONTS}/700Bold/Manrope_700Bold.ttf")}}
@font-face{{font-family:Manrope;font-weight:600;src:url("file://{FONTS}/600SemiBold/Manrope_600SemiBold.ttf")}}
@font-face{{font-family:Manrope;font-weight:500;src:url("file://{FONTS}/500Medium/Manrope_500Medium.ttf")}}
*{{margin:0;padding:0;box-sizing:border-box}}
html,body{{width:{W}px;height:{H}px;overflow:hidden;background:{bg}}}
body{{position:relative;font-family:Manrope,sans-serif;-webkit-font-smoothing:antialiased}}
.abs{{position:absolute}}
{css}
</style></head><body>{body}</body></html>"""

def rgba(c, a):
    return f"rgba({c[0]},{c[1]},{c[2]},{a})"

def phone(x, y, pw, screen_name, platform, shadow=(20, 10, 60), shadow_a=0.45, z=1):
    """A realistic phone: metal rim, even black bezel, screen, subtle side buttons, soft shadow.
    Returns (html, geometry)."""
    ios = platform == "ios"
    rim = max(3, round(pw * (0.0115 if ios else 0.0095)))
    b = round(pw * (0.033 if ios else 0.030))
    sw = pw - 2 * b
    sh = round(sw * RAW_H / RAW_W)
    ph = sh + 2 * b
    r_scr = sw * (0.125 if ios else 0.100)
    r_out = r_scr + b
    android = (not ios) and ANDROID_CHROME_ON_PLAY
    src = prep_screen(screen_name, sw, sh, android)
    s1, s2 = pw * 0.035, pw * 0.085
    html = [f"""<div class="abs" style="left:{x}px;top:{y}px;width:{pw}px;height:{ph}px;z-index:{z}">"""]
    # side buttons sit behind the body, poking out a few px
    bt = max(3, round(pw * 0.0062))
    btn_css = (f"position:absolute;width:{bt + 2}px;border-radius:{bt}px;"
               "background:linear-gradient(90deg,#1b1b1f,#4a4a51 45%,#2a2a2f);")
    if ios:
        for (t0, t1) in ((0.163, 0.213), (0.256, 0.332), (0.350, 0.425)):
            html.append(f'<div style="{btn_css}left:{-bt}px;top:{ph*t0:.1f}px;height:{ph*(t1-t0):.1f}px"></div>')
        html.append(f'<div style="{btn_css}right:{-bt}px;top:{ph*0.288:.1f}px;height:{ph*0.106:.1f}px;'
                    'background:linear-gradient(270deg,#1b1b1f,#4a4a51 45%,#2a2a2f)"></div>')
    else:
        for (t0, t1) in ((0.215, 0.268), (0.305, 0.425)):
            html.append(f'<div style="{btn_css}right:{-bt}px;top:{ph*t0:.1f}px;height:{ph*(t1-t0):.1f}px;'
                        'background:linear-gradient(270deg,#1b1b1f,#4a4a51 45%,#2a2a2f)"></div>')
    # body: metal rim with a lit edge
    html.append(
        f'<div class="abs" style="left:0;top:0;width:{pw}px;height:{ph}px;border-radius:{r_out:.1f}px;'
        f'background:linear-gradient(150deg,#75757d 0%,#34343a 14%,#202024 40%,#26262b 70%,#55555c 100%);'
        f'box-shadow:0 {s1:.0f}px {s2:.0f}px {rgba(shadow, shadow_a)},'
        f'0 {pw*0.008:.0f}px {pw*0.02:.0f}px {rgba(shadow, shadow_a*0.6)},'
        f'inset 0 0 0 1.5px rgba(255,255,255,0.20),inset 0 0 0 {max(2, rim*0.45):.1f}px rgba(0,0,0,0.25)"></div>')
    # black bezel
    html.append(
        f'<div class="abs" style="left:{rim}px;top:{rim}px;width:{pw-2*rim}px;height:{ph-2*rim}px;'
        f'border-radius:{r_out-rim:.1f}px;background:#060608;'
        f'box-shadow:0 0 0 1px rgba(0,0,0,0.55),inset 0 0 0 1px rgba(255,255,255,0.06)"></div>')
    # screen
    html.append(
        f'<div class="abs" style="left:{b}px;top:{b}px;width:{sw}px;height:{sh}px;border-radius:{r_scr:.1f}px;'
        f'overflow:hidden;background:#fff"><img src="file://{src}" style="display:block;width:{sw}px;height:{sh}px">')
    if android:
        html.append(android_status(sw, screen_name))
    html.append('</div></div>')
    return "".join(html), dict(x=x, y=y, pw=pw, ph=ph, b=b, sw=sw, sh=sh, r_scr=r_scr)

def android_status(sw, screen_name):
    """A plain Android status bar (time, signal, wifi, battery) and a punch-hole camera."""
    k = sw / RAW_W
    ink = "#1d1b20"
    cy = 70 * k                     # vertical centre of the status bar, raw px * k
    fs = 44 * k
    ic = 42 * k
    hole = 40 * k
    sig = f'<svg width="{ic:.1f}" height="{ic:.1f}" viewBox="0 0 24 24"><path d="M21 3v18H3z" fill="{ink}"/></svg>'
    wifi = (f'<svg width="{ic:.1f}" height="{ic:.1f}" viewBox="0 0 24 24">'
            f'<path d="M12 20.5 1.2 8.6a15.6 15.6 0 0 1 21.6 0z" fill="{ink}"/></svg>')
    bat = (f'<svg width="{ic*0.62:.1f}" height="{ic:.1f}" viewBox="0 0 14 24">'
           f'<rect x="4.5" y="1" width="5" height="2.6" rx="1" fill="{ink}"/>'
           f'<rect x="1.5" y="3" width="11" height="20" rx="2.4" fill="{ink}"/></svg>')
    return (
        f'<div class="abs" style="left:{72*k:.1f}px;top:{cy - fs*0.62:.1f}px;font-weight:600;font-size:{fs:.1f}px;'
        f'line-height:{fs*1.2:.1f}px;letter-spacing:0.01em;color:{ink}">9:41</div>'
        f'<div class="abs" style="right:{68*k:.1f}px;top:{cy - ic/2:.1f}px;height:{ic:.1f}px;display:flex;'
        f'gap:{10*k:.1f}px;align-items:center">{wifi}{sig}{bat}</div>'
        f'<div class="abs" style="left:{sw/2 - hole/2:.1f}px;top:{cy - hole/2:.1f}px;width:{hole:.1f}px;'
        f'height:{hole:.1f}px;border-radius:50%;background:#050506;'
        f'box-shadow:inset 0 0 0 {max(1, 3*k):.1f}px #1b1b20"></div>')

def caption(lines, W, top, size, fg, align="center", left=0, weight=800, lh=1.04, track=-0.025):
    txt = "<br>".join(lines)
    style = (f"left:{left}px;top:{top}px;width:{W - 2*left}px;text-align:{align};font-weight:{weight};"
             f"font-size:{size}px;line-height:{lh};letter-spacing:{track}em;color:{fg}")
    return f'<div class="abs" style="{style}">{txt}</div>'

# ---------------------------------------------------------------------------------------------
# Layouts

def frame_layout(fmt):
    W, H = fmt["W"], fmt["H"]
    tall = fmt["aspect"] == "tall"
    # cap: caption size; vis_top: margin above the caption glyphs; gap: caption descenders to phone.
    if tall:
        cap, vis_top, gap = W * 0.103, W * 0.130, W * 0.109
    elif fmt.get("tablet"):
        cap, vis_top, gap = W * 0.094, W * 0.100, W * 0.085
    else:
        cap, vis_top, gap = W * 0.100, W * 0.100, W * 0.085
    # Manrope at line-height 1.04: glyph tops sit 0.162em below the box top; the second line's
    # descenders end 2.17em below it (measured from the renders).
    cap = round(cap)
    cap_top = round(vis_top - 0.162 * cap)
    phone_top = round(cap_top + 2.17 * cap + gap)
    # size the phone so its screen is visible down to 97.4% (just past the tab bar),
    # with the rest of the phone running off the bottom edge
    k_b = 0.033 if fmt["platform"] == "ios" else 0.030
    visible = 0.974
    pw = (H - phone_top) / (k_b + visible * (1 - 2 * k_b) * RAW_H / RAW_W)
    pw = int(round(pw / 2) * 2)
    return dict(cap=cap, cap_top=cap_top, phone_top=phone_top, pw=pw)

def frame_page(fmt, fr):
    W, H = fmt["W"], fmt["H"]
    L = frame_layout(fmt)
    lay = fr.get("layout", "single")
    body = caption(fr["caption"], W, L["cap_top"], L["cap"], fr["fg"])
    if lay in ("single", "callout"):
        x = (W - L["pw"]) // 2
        ph_html, g = phone(x, L["phone_top"], L["pw"], fr["screen"], fmt["platform"], fr["shadow"], fr["shadow_a"])
        body += ph_html
        if lay == "callout":
            body += callout(fr, g, fmt)
    elif lay == "duo":
        tall = fmt["aspect"] == "tall"
        side = round(W * (0.045 if tall else 0.06))
        pw_b = int(round(L["pw"] * (0.815 if tall else 0.84) / 2) * 2)
        pw_f = int(round(L["pw"] * (0.865 if tall else 0.89) / 2) * 2)
        back, gb = phone(side, L["phone_top"], pw_b, fr["back"], fmt["platform"], fr["shadow"], fr["shadow_a"] * 0.8, z=1)
        # front phone sits low enough that the sheet's empty lower third runs off the canvas
        kb = 0.033 if fmt["platform"] == "ios" else 0.030
        b_f = round(pw_f * kb); sw_f = pw_f - 2 * b_f; sh_f = round(sw_f * RAW_H / RAW_W)
        top_f = round(H - H * 0.035 - sh_f * fr["content_end"] / RAW_H - b_f)
        front, gf = phone(W - side - pw_f, top_f, pw_f, fr["screen"], fmt["platform"], fr["shadow"], fr["shadow_a"], z=2)
        body += back + front
    return page(W, H, body, bg=fr["bg"])

def callout(fr, g, fmt):
    """Lift a strip of the screen out of the phone, enlarged in place, as a floating panel."""
    box = fr["patch"]
    s = g["sw"] / RAW_W
    w = round((box[2] - box[0]) * s * fr["zoom"])
    src, w, h = prep_patch(fr["screen"], box, w)
    cx = g["x"] + g["b"] + (box[0] + box[2]) / 2 * s
    cy = g["y"] + g["b"] + (box[1] + box[3]) / 2 * s
    r = 58 * s * fr["zoom"]
    sh, a = fr["shadow"], fr["shadow_a"]
    return (f'<div class="abs" style="left:{cx - w/2:.0f}px;top:{cy - h/2:.0f}px;width:{w}px;height:{h}px;z-index:5;'
            f'border-radius:{r:.1f}px;overflow:hidden;'
            f'box-shadow:0 {w*0.035:.0f}px {w*0.075:.0f}px {rgba(sh, a*0.62)},0 {w*0.006:.0f}px {w*0.014:.0f}px {rgba(sh, a*0.38)},'
            f'0 0 0 1.5px rgba(255,255,255,0.55)">'
            f'<img src="file://{src}" style="display:block;width:{w}px;height:{h}px"></div>')

# Hero collage: (card, centre x as fraction of W, centre y as fraction of H, width as fraction of W, rotation, z)
HERO = {
    "tall": dict(
        lock_h=0.0290, lock_x=0.072, lock_y=0.058, head=0.1215, head_y=0.112, lh=1.02,
        cards=[
            ("wave",    0.262, 0.428, 0.335, -6.0, 2),
            ("saturn",  0.756, 0.402, 0.325,  4.5, 1),
            ("aurora",  0.500, 0.612, 0.340, -2.0, 3),
            ("lilies",  0.190, 0.772, 0.330,  5.0, 2),
            ("jwst",    0.808, 0.772, 0.330, -4.0, 3),
            ("mirror",  0.540, 0.985, 0.330, -3.0, 1),
        ]),
    "wide": dict(
        lock_h=0.0385, lock_x=0.075, lock_y=0.056, head=0.1160, head_y=0.122, lh=1.02,
        cards=[
            ("wave",    0.245, 0.495, 0.300, -6.0, 2),
            ("saturn",  0.752, 0.462, 0.290,  4.5, 1),
            ("aurora",  0.535, 0.695, 0.305, -2.0, 3),
            ("lilies",  0.180, 0.842, 0.295,  5.0, 2),
            ("jwst",    0.818, 0.818, 0.295, -4.0, 3),
            ("mirror",  0.520, 1.005, 0.295, -3.0, 1),
        ]),
    "tablet": dict(
        lock_h=0.0345, lock_x=0.080, lock_y=0.056, head=0.1080, head_y=0.118, lh=1.02,
        cards=[
            ("wave",    0.255, 0.490, 0.285, -6.0, 2),
            ("saturn",  0.745, 0.458, 0.275,  4.5, 1),
            ("aurora",  0.530, 0.688, 0.290, -2.0, 3),
            ("lilies",  0.190, 0.840, 0.280,  5.0, 2),
            ("jwst",    0.808, 0.815, 0.280, -4.0, 3),
            ("mirror",  0.515, 1.000, 0.280, -3.0, 1),
        ]),
}

# brand order (indigo > violet > lilac > coral); the coral end is deepened to clear 3:1 on the light ground
GRAD = "linear-gradient(90deg,#4F2BEA 0%,#7B45F3 30%,#BC48D7 64%,#EC5A45 100%)"
# background-clip:text only paints inside the box; pad the box past the descenders (p, g) and the
# overshoot, and pull the margins back so the layout does not move.
GRAD_SPAN = (f"background:{GRAD};-webkit-background-clip:text;background-clip:text;color:transparent;"
             "display:inline-block;padding:0.12em 0.06em 0.30em 0;margin:-0.12em -0.06em -0.30em 0")

def hero_page(fmt):
    W, H = fmt["W"], fmt["H"]
    P = HERO["tablet" if fmt.get("tablet") else fmt["aspect"]]
    lh_px = round(H * P["lock_h"])
    lock, lw, lhh = prep_lockup(lh_px)
    mx = round(W * P["lock_x"])
    head = round(W * P["head"])
    parts = []
    parts.append(f'<img class="abs" src="file://{lock}" style="left:{mx}px;top:{round(H*P["lock_y"])}px;'
                 f'width:{lw}px;height:{lhh}px">')
    l1, l2, l3 = FRAMES[0]["caption"]
    parts.append(
        f'<div class="abs" style="left:{mx - round(head*0.055)}px;top:{round(H*P["head_y"])}px;font-weight:800;'
        f'font-size:{head}px;line-height:{P["lh"]};letter-spacing:-0.035em;color:{INK}">'
        f'{l1}<br>{l2}<br><span style="{GRAD_SPAN}">{l3}</span></div>')
    for key, cx, cy, wf, rot, z in P["cards"]:
        cw = round(W * wf)
        src, cw, ch, r = prep_card(key, cw)
        left, top = round(W * cx - cw / 2), round(H * cy - ch / 2)
        if key == "mirror":
            import math
            have = Image.open(src).height              # bitmap rows that exist
            drop = abs(math.sin(math.radians(rot))) * cw / 2 + 2
            assert H - top + drop < have, f"partial card would show past its bitmap ({H - top + drop:.0f} >= {have})"
        parts.append(
            f'<div class="abs" style="left:{left}px;top:{top}px;width:{cw}px;height:{ch}px;z-index:{z};'
            f'transform:rotate({rot}deg);border-radius:{r:.1f}px;overflow:hidden;'
            f'box-shadow:0 {cw*0.05:.0f}px {cw*0.11:.0f}px rgba(45,22,120,0.20),'
            f'0 {cw*0.010:.0f}px {cw*0.025:.0f}px rgba(45,22,120,0.12)">'
            f'<img src="file://{src}" style="display:block;width:{cw}px;height:{ch}px"></div>')
    bg = ("radial-gradient(60% 40% at 88% 62%, rgba(196,164,255,0.40), rgba(196,164,255,0) 100%),"
          "radial-gradient(55% 35% at 8% 96%, rgba(255,205,186,0.50), rgba(255,205,186,0) 100%),"
          "linear-gradient(180deg,#FBFAFF 0%,#F4F0FF 100%)")
    return page(W, H, "".join(parts), css=f"body{{background:{bg}}}", bg="#F6F3FF")

FEATURE = dict(W=1024, H=500)
# safe zone for anything that must not be cropped: x 72..600, y 100..400
FEATURE_CARDS = [  # (card, centre x px, centre y px, width px, rotation, z)
    ("wave",    662, 322, 184, -6.0, 2),
    ("saturn",  808, 194, 176,  3.0, 3),
    ("aurora",  950, 324, 180,  6.0, 1),
]

def feature_page():
    W, H = FEATURE["W"], FEATURE["H"]
    lock, lw, lhh = prep_lockup(36)
    head = 56
    x0 = 104
    parts = [f'<img class="abs" src="file://{lock}" style="left:{x0}px;top:124px;width:{lw}px;height:{lhh}px">',
             f'<div class="abs" style="left:{x0 - round(head*0.055)}px;top:182px;font-weight:800;font-size:{head}px;'
             f'line-height:1.02;letter-spacing:-0.035em;color:{INK}">Everything<br>you save.<br>'
             f'<span style="{GRAD_SPAN}">Kept together.</span></div>']
    for key, cx, cy, cw, rot, z in FEATURE_CARDS:
        src, cw, ch, r = prep_card(key, cw)
        parts.append(
            f'<div class="abs" style="left:{round(cx - cw/2)}px;top:{round(cy - ch/2)}px;width:{cw}px;height:{ch}px;'
            f'z-index:{z};transform:rotate({rot}deg);border-radius:{r:.1f}px;overflow:hidden;'
            f'box-shadow:0 {cw*0.05:.0f}px {cw*0.11:.0f}px rgba(45,22,120,0.22),0 {cw*0.01:.0f}px {cw*0.025:.0f}px rgba(45,22,120,0.12)">'
            f'<img src="file://{src}" style="display:block;width:{cw}px;height:{ch}px"></div>')
    bg = ("radial-gradient(45% 75% at 80% 55%, rgba(196,164,255,0.45), rgba(196,164,255,0) 100%),"
          "radial-gradient(40% 60% at 0% 100%, rgba(255,205,186,0.45), rgba(255,205,186,0) 100%),"
          "linear-gradient(180deg,#FBFAFF 0%,#F2EDFF 100%)")
    return page(W, H, "".join(parts), css=f"body{{background:{bg}}}", bg="#F6F3FF")

HERO_BG = "#F6F3FF"

def frame_label(fr):
    cap = " ".join(fr["caption"]).replace(", ", ", ")
    colour = HERO_BG + " (light lavender)" if fr.get("kind") == "hero" else fr["bg"]
    return cap, colour

def contact_page(dest):
    """Every App Store frame, small, in store order: 6.9-inch row, then 6.5-inch row."""
    tw, gap, mx = 300, 28, 64
    W = mx * 2 + 6 * tw + 5 * gap
    rows = []
    for fk, label in (("appstore-6.9", "iPhone 6.9-inch · 1320 × 2868"),
                      ("appstore-6.5", "iPhone 6.5-inch · 1284 × 2778")):
        fmt = FORMATS[fk]
        th = round(fmt["H"] * tw / fmt["W"])
        cells = []
        for i, fr in enumerate(FRAMES):
            cap, colour = frame_label(fr)
            sw = HERO_BG if fr.get("kind") == "hero" else fr["bg"]
            src = f"{dest}/{fk}/{fk}-{fr['id']}.png"
            cells.append(
                f'<div style="width:{tw}px"><img src="file://{src}" style="display:block;width:{tw}px;height:{th}px;'
                f'border-radius:22px;box-shadow:0 0 0 1px rgba(20,16,40,0.10),0 10px 24px rgba(20,16,40,0.10)">'
                f'<div style="margin-top:14px;font-size:17px;line-height:1.3;height:2.6em;font-weight:700;color:{INK}">'
                f'<span style="color:#8A84A3">{i + 1}</span>&nbsp; {cap}</div>'
                f'<div style="margin-top:6px;font-size:14px;font-weight:600;color:#6F6A86;display:flex;align-items:center;gap:7px">'
                f'<span style="width:13px;height:13px;border-radius:4px;background:{sw};box-shadow:0 0 0 1px rgba(0,0,0,0.12)"></span>'
                f'{colour}</div></div>')
        rows.append(f'<div style="margin-top:44px;font-size:15px;font-weight:700;letter-spacing:0.06em;'
                    f'text-transform:uppercase;color:#6F6A86">{label}</div>'
                    f'<div style="display:flex;gap:{gap}px;margin-top:16px">{"".join(cells)}</div>')
    body = (f'<div style="padding:52px {mx}px 64px">'
            f'<div style="font-size:34px;font-weight:800;letter-spacing:-0.02em;color:{INK}">Allkept · App Store screenshots</div>'
            f'<div style="margin-top:8px;font-size:18px;font-weight:500;color:#6F6A86">In store order. The first three show in search results.</div>'
            + "".join(rows) + '</div>')
    return W, body

# ---------------------------------------------------------------------------------------------
# Render + write

SRGB = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()

def render(jobs):
    if not jobs:
        return
    jf = f"{WORK}/jobs.json"
    with open(jf, "w") as f:
        json.dump(jobs, f)
    r = subprocess.run(["node", f"{HERE}/shot.cjs", jf], capture_output=True, text=True)
    sys.stdout.write(r.stdout[-2000:])
    if r.returncode != 0 or "FAILED" in r.stderr:
        sys.stderr.write(r.stderr)
        raise SystemExit("render failed")

def finish(png_in, out_path, W, H):
    im = Image.open(png_in)
    assert im.size == (W, H), (png_in, im.size)
    im = im.convert("RGB")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    im.save(out_path, "PNG", optimize=True, icc_profile=SRGB)
    return out_path

def main():
    args = sys.argv[1:]
    dest = PREVIEW
    if "--final" in args:
        args.remove("--final"); dest = FINAL
    only = None
    if "--only" in args:
        i = args.index("--only"); only = set(args[i + 1:]); args = args[:i]
    fmts = args or list(FORMATS)
    jobs, outs = [], []
    for fk in fmts:
        fmt = FORMATS[fk]
        for fr in FRAMES:
            if only and fr["id"] not in only:
                continue
            html = hero_page(fmt) if fr.get("kind") == "hero" else frame_page(fmt, fr)
            hp = f"{HTMLD}/{fk}-{fr['id']}.html"
            with open(hp, "w") as f:
                f.write(html)
            rp = f"{RENDER}/{fk}-{fr['id']}.png"
            jobs.append(dict(html=hp, out=rp, w=fmt["W"], h=fmt["H"]))
            outs.append((rp, f"{dest}/{fk}/{fk}-{fr['id']}.png", fmt["W"], fmt["H"]))
    if not only or "feature" in only:
        hp = f"{HTMLD}/feature.html"
        with open(hp, "w") as f:
            f.write(feature_page())
        rp = f"{RENDER}/feature.png"
        jobs.append(dict(html=hp, out=rp, w=FEATURE["W"], h=FEATURE["H"]))
        outs.append((rp, f"{dest}/play-feature-graphic-1024x500.png", FEATURE["W"], FEATURE["H"]))
    render(jobs)
    for rp, op, W, H in outs:
        finish(rp, op, W, H)
        print("wrote", op, os.path.getsize(op) // 1024, "KB")
    if not only or "contact" in only:
        # second pass: the sheet is built from the finished App Store files
        W, body = contact_page(dest)
        hp = f"{HTMLD}/contact.html"
        with open(hp, "w") as f:
            f.write(page(W, 10, body, css="html,body{height:auto}", bg="#F3F2F8"))
        rp = f"{RENDER}/contact.png"
        r = subprocess.run(["node", f"{HERE}/shot_full.cjs", hp, rp, str(W)], capture_output=True, text=True)
        if r.returncode != 0:
            sys.stderr.write(r.stderr); raise SystemExit("contact sheet render failed")
        im = Image.open(rp)
        op = f"{dest}/contact-sheet.png"
        finish(rp, op, im.width, im.height)
        print("wrote", op, im.size, os.path.getsize(op) // 1024, "KB")

if __name__ == "__main__":
    main()
