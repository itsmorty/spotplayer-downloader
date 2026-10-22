# SpotPlayer Static Extractor

[![Deploy to GitHub Pages](https://github.com/itsmorty/sp-static-extractor/actions/workflows/deploy.yml/badge.svg)](https://github.com/itsmorty/sp-static-extractor/actions/workflows/deploy.yml)

A 100 % client-side web app that turns a SpotPlayer share code into downloadable MP4 files — for one video or a whole playlist.

**Live app:** <https://itsmorty.github.io/sp-static-extractor/>

---

## English

### What it does

- Extracts **a single video** or **a whole playlist** (selected videos are processed strictly one after another).
- Runs **100 % in the browser**: no server, no upload, no ffmpeg, no WASM, no React.
- Persian **RTL UI** with a **light/dark theme toggle** that persists across reloads.
- Previews a single extracted video in a `<video>` element before saving; playlist items are saved one at a time with per-item and overall progress.

### How it works

1. **Share code** — you paste a code (or open the matching file). Codes are either raw JSON or `SP1:` + base64 of gzipped JSON.
2. **CDN segments** — the code contains the course/video IDs and the CDN host rotation; the app fetches `.spot` byte ranges from the SpotPlayer CDN.
3. **XOR decryption** — each `.spot` file embeds its own 127-byte key in the first segment header, so no license blob, device key, or activation is needed by this app. Segments are decrypted in place.
4. **Remux** — a hand-written, pure-JS ISO-BMFF (`mp4s` → MP4) muxer parses the container and assembles `ftyp` + `mdat` + `moov` as Blob parts, with sample durations matched to the audio track.
5. **Save** — the result is offered as an MP4. In Chromium browsers the File System Access API streams straight to disk; elsewhere a Blob download is used.

### Privacy

- **No analytics, no telemetry, no backend.** The page is a static bundle.
- The only network requests the app makes go to the **SpotPlayer CDN** for the video segments.
- Your share code, course data, and credentials **never leave the browser**. Nothing is stored on a server; the only persistence is the theme choice in `localStorage`.

### Legal / ownership

This is an **unofficial** tool and is **not affiliated with, endorsed by, or supported by SpotPlayer**. Use it **only for courses you legally own**, and respect the terms you agreed to. The authors take no responsibility for misuse. All course content and trademarks belong to their respective owners.

### How to get a share code

1. Open the in-app **Help** dialog (the help button in the header) and copy the **bookmarklet**.
2. In SpotPlayer, sign in and **open a video once** so the player has stored the license and course data locally — activation is required.
3. Create a new browser bookmark, paste the copied `javascript:` code as its URL, and then run that bookmark on the SpotPlayer course page. It reads the locally stored data and copies the share code (it falls back to a prompt if the Clipboard API is unavailable).
4. Paste the code into this app.

Notes and caveats:

- The Clipboard API needs a **secure context** (HTTPS or `localhost`) and a user gesture. On plain HTTP or in restricted browsers, use the prompt fallback and copy manually.
- **Raw JSON share codes are also accepted**, so a code produced by other means works too.
- The bookmarklet is built from the export logic validated in spike 003. Live end-to-end verification of the bookmarklet against a signed-in SpotPlayer session is still **partial** — if the stored data shape differs, the bookmarklet may need an update.

### Development quickstart

Requirements: **Node 22.12+ or 24** (Node 26 is fine) and **pnpm**.

```bash
pnpm install
pnpm dev        # local dev server
pnpm test       # Vitest unit tests
pnpm build      # type-check + static build into dist/
pnpm preview    # serve the production build locally
```

`base` is relative (`./`) so the same build works on a GitHub Pages project subpath.

### Manual test checklist

No automated browser/E2E tests exist by design; these checks are the release gate.

- [ ] **Single video:** paste a real share code, extract video 17. The `<video>` metadata reports **≈429.418667 s** and **832×470**, and the downloaded MP4 plays to the end with audio in sync.
- [ ] **Playlist:** select 2 videos and run "download all". Two MP4s are produced **sequentially** (never concurrently), each with its own status, and both per-item and overall progress advance.
- [ ] **Theme:** toggle light/dark, reload, and confirm the choice persists (and that the OS preference is used on first visit).
- [ ] **Help + bookmarklet:** open the help dialog, copy the bookmarklet, and confirm the clipboard contains a single-line `javascript:` URL.
- [ ] **Disclaimer:** on a fresh profile/storage the first-run disclaimer appears once; accepting it prevents it from showing again after reload.
- [ ] **Large file:** in Chrome or Edge, extract a **1.3 GB** video using the File System Access save dialog. There is no OOM, peak memory stays around **2× the file size**, and the file saves. Metadata/preview may take a while to appear for very large files.
- [ ] **Pages build:** repeat the single-video, 2-item playlist, and theme checks on the deployed GitHub Pages URL (project subpath).

The "68 videos" figure quoted elsewhere is specific to the reference course; any course with a valid share code works.

### Browser support and large-file notes

- **Chromium (Chrome/Edge):** best experience — File System Access API streams to disk, and the app avoids holding a second full-size copy during remux.
- **Firefox / Safari:** supported through the anchor-download fallback, but the finished Blob is held in memory, so very large files may fail.
- The MP4 `mdat` box uses 32-bit sizes, so a single video must stay **under 4 GB**.
- Playlists run **strictly sequentially**; each object URL is revoked between items. A full course can be many gigabytes, so plan disk space.
- Extraction needs a browser with `DecompressionStream` (modern Chromium, Firefox, Safari) and network access to the SpotPlayer CDN.

### Project structure

```text
spotplayer-downloader/
├─ .github/workflows/deploy.yml   # test + build + GitHub Pages deploy
├─ public/
│  ├─ bookmarklet.txt             # single-line javascript: bookmarklet
│  └─ favicon.svg
├─ src/
│  ├─ app.ts, main.ts             # shell and wiring
│  ├─ i18n/fa.ts                  # every user-visible Persian string
│  ├─ lib/
│  │  ├─ remux.ts                 # pure-JS mp4s → ISO-BMFF
│  │  ├─ spot.ts                  # CDN hosts, segment URLs, XOR
│  │  ├─ share.ts                 # share-code decode (SP1: / raw JSON)
│  │  ├─ extract.ts               # fetch → decrypt → remux
│  │  ├─ queue.ts                 # sequential playlist runner
│  │  └─ download.ts              # FSA streaming + anchor fallback
│  ├─ features/                   # share input, video list, progress, help…
│  ├─ ui/                         # el, dialog, toast, theme
│  └─ styles/app.css              # Tailwind v4 + DaisyUI
├─ index.html
├─ vite.config.ts
└─ package.json
```

### Tests and validation

- **Vitest** unit tests cover the remuxer (synthetic `mp4s` fixture round-trip), XOR round-trip, share-code decoding, extraction against a mocked `fetch`, the sequential queue, formatting, and theme persistence — currently **147 tests in 17 files**.
- There are **no automated browser/E2E tests**; validation is unit tests plus the manual checklist above.
- `pnpm build` type-checks and emits a static `dist/`.

### License

MIT — see [LICENSE](./LICENSE).

---

## فارسی

**نسخهٔ آنلاین:** <https://itsmorty.github.io/sp-static-extractor/>

### این ابزار چه می‌کند؟

- **یک ویدیو** یا **کل playlist** (فهرست انتخابی) را استخراج می‌کند؛ ویدیوهای یک playlist به‌صورت **کاملاً متوالی** و یکی‌یکی پردازش می‌شوند.
- **۱۰۰٪ در مرورگر** اجرا می‌شود: بدون سرور، بدون آپلود، بدون ffmpeg، بدون WASM و بدون React.
- رابط کاربری **فارسی و راست‌به‌چپ** با **کلید تغییر پوستهٔ روشن/تاریک** که انتخاب آن پس از بارگذاری مجدد حفظ می‌شود.
- یک ویدیوی استخراج‌شده را قبل از ذخیره در یک عنصر `<video>` پیش‌نمایش می‌دهد؛ آیتم‌های playlist یکی‌یکی و با پیشرفت هر آیتم و پیشرفت کلی ذخیره می‌شوند.

### چطور کار می‌کند؟

1. **کد اشتراک** — کد را می‌چسبانید یا فایل آن را باز می‌کنید. کد می‌تواند JSON خام یا `SP1:` به‌همراه base64 از JSON فشرده‌شده با gzip باشد.
2. **بخش‌های CDN** — کد شامل شناسهٔ دوره/ویدیو و چرخش میزبان‌های CDN است؛ برنامه بازه‌های بایتی فایل‌های `.spot` را از CDN اسپات‌پلیر دریافت می‌کند.
3. **رمزگشایی XOR** — کلید ۱۲۷ بایتی داخل هدر نخستین بخش هر فایل `.spot` قرار دارد؛ بنابراین این برنامه به license blob، کلید دستگاه یا فعال‌سازی نیازی ندارد. بخش‌ها در همان حافظه رمزگشایی می‌شوند.
4. **Remux** — یک muxer دست‌نویس و pure-JS برای ISO-BMFF (تبدیل `mp4s` به MP4) محفظه را تجزیه می‌کند و `ftyp` + `mdat` + `moov` را به‌صورت قطعات Blob می‌سازد، با مدت‌زمان نمونه‌ها هم‌تراز با ترک صدا.
5. **ذخیره** — خروجی به‌صورت MP4 ارائه می‌شود. در مرورگرهای Chromium از File System Access API برای نوشتن مستقیم روی دیسک استفاده می‌شود؛ در بقیهٔ مرورگرها دانلود Blob انجام می‌شود.

### حریم خصوصی

- **بدون analytics، بدون telemetry و بدون سرور.** صفحه یک بستهٔ استاتیک است.
- تنها درخواست‌های شبکهٔ برنامه به **CDN اسپات‌پلیر** برای دریافت بخش‌های ویدیو است.
- کد اشتراک، اطلاعات دوره و اطلاعات ورود شما **هرگز از مرورگر خارج نمی‌شود**. هیچ چیز روی سرور ذخیره نمی‌شود؛ تنها دادهٔ ماندگار، انتخاب پوسته در `localStorage` است.

### مجوز و مالکیت

این ابزار **غیررسمی** است و **هیچ وابستگی، تأیید یا پشتیبانی‌ای از سوی اسپات‌پلیر ندارد**. آن را **فقط برای دوره‌هایی که به‌طور قانونی خریده‌اید** به کار ببرید و به قوانینی که پذیرفته‌اید احترام بگذارید. نویسندگان مسئول سوءاستفاده نیستند. تمام محتوا و نشان‌های تجاری متعلق به صاحبانشان است.

### چطور کد اشتراک بگیریم؟

1. در برنامه، دیالوگ **راهنما** را باز کنید (دکمهٔ راهنما در سربرگ) و **بوکمارکلت** را کپی کنید.
2. در اسپات‌پلیر وارد شوید و **یک‌بار یک ویدیو را باز کنید** تا بازپخش‌کننده اطلاعات لایسنس و دوره را به‌صورت محلی ذخیره کند — فعال‌سازی لازم است.
3. یک نشانک جدید در مرورگر بسازید، کد `javascript:` کپی‌شده را در فیلد آدرس آن بچسبانید و سپس آن نشانک را در صفحهٔ دورهٔ اسپات‌پلیر اجرا کنید. دادهٔ ذخیره‌شدهٔ محلی را می‌خواند و کد اشتراک را کپی می‌کند (اگر Clipboard API در دسترس نباشد، کد را در یک prompt نشان می‌دهد).
4. کد را در این برنامه بچسبانید.

نکته‌ها و محدودیت‌ها:

- Clipboard API به **secure context** (HTTPS یا `localhost`) و تعامل کاربر نیاز دارد. روی HTTP ساده یا مرورگرهای محدود، از prompt و کپی دستی استفاده کنید.
- **کد اشتراک JSON خام هم پذیرفته می‌شود**؛ پس کدی که با روش دیگری ساخته شده هم کار می‌کند.
- بوکمارکلت بر پایهٔ منطق خروجی اعتبارسنجی‌شده در spike 003 ساخته شده است، اما تأیید سرتاسری آن روی یک نشست واردشدهٔ واقعی اسپات‌پلیر هنوز **ناقص** است؛ اگر شکل دادهٔ ذخیره‌شده متفاوت باشد، ممکن است بوکمارکلت نیاز به به‌روزرسانی داشته باشد.

### شروع سریع برای توسعه

پیش‌نیازها: **Node 22.12+ یا 24** (Node 26 هم مناسب است) و **pnpm**.

```bash
pnpm install
pnpm dev        # سرور توسعهٔ محلی
pnpm test       # تست‌های واحد Vitest
pnpm build      # بررسی نوع + ساخت استاتیک در dist/
pnpm preview    # ارائهٔ نسخهٔ production به‌صورت محلی
```

مقدار `base` نسبی (`./`) است تا همان خروجی روی زیرمسیر پروژهٔ GitHub Pages هم کار کند.

### چک‌لیست آزمون دستی

به‌طور عمدی هیچ تست خودکار مرورگر/E2E وجود ندارد؛ این بررسی‌ها معیار انتشار هستند.

- [ ] **یک ویدیو:** یک کد اشتراک واقعی را بچسبانید و ویدیوی ۱۷ را استخراج کنید. متادیتای `<video>` باید **حدود ۴۲۹٫۴۱۸۶۶۷ ثانیه** و **۸۳۲×۴۷۰** را نشان دهد و MP4 دانلودشده تا انتها با صدای هم‌تراز پخش شود.
- [ ] **Playlist:** دو ویدیو را انتخاب کنید و «دانلود همه» را اجرا کنید. دو فایل MP4 **به‌ترتیب و متوالی** (نه هم‌زمان) ساخته می‌شوند، هر کدام وضعیت خودش را دارد و پیشرفت هر آیتم و پیشرفت کلی جلو می‌رود.
- [ ] **پوسته:** پوستهٔ روشن/تاریک را عوض کنید، صفحه را دوباره بارگذاری کنید و ببینید انتخاب حفظ می‌شود (و در نخستین بازدید، ترجیح سیستم‌عامل لحاظ می‌شود).
- [ ] **راهنما + بوکمارکلت:** دیالوگ راهنما را باز کنید، بوکمارکلت را کپی کنید و مطمئن شوید کلیپ‌بورد یک URL تک‌خطی `javascript:` دارد.
- [ ] **سلب مسئولیت:** در نمایه/حافظهٔ تازه، پیام سلب مسئولیت فقط یک‌بار نمایش داده می‌شود و پس از پذیرش و بارگذاری مجدد دیگر نمی‌آید.
- [ ] **فایل بزرگ:** در Chrome یا Edge، ویدیوی **۱٫۳ گیگابایتی** را با دیالوگ ذخیرهٔ File System Access استخراج کنید. OOM رخ نمی‌دهد، اوج حافظه حدود **۲ برابر حجم فایل** می‌ماند و فایل ذخیره می‌شود. برای فایل‌های خیلی بزرگ، نمایش متادیتا/پیش‌نمایش ممکن است زمان ببرد.
- [ ] **نسخهٔ Pages:** بررسی یک ویدیو، playlist دورودیویی و پوسته را روی URL منتشرشدهٔ GitHub Pages (زیرمسیر پروژه) تکرار کنید.

عدد «۶۸ ویدیو» که در جای‌جای مستندات می‌آید مربوط به دورهٔ مرجع است؛ هر دوره‌ای با کد اشتراک معتبر کار می‌کند.

### پشتیبانی مرورگر و فایل‌های بزرگ

- **Chromium (Chrome/Edge):** بهترین تجربه — File System Access API مستقیماً روی دیسک می‌نویسد و برنامه در هنگام remux نسخهٔ کامل دوم را نگه نمی‌دارد.
- **Firefox / Safari:** با روش جایگزین دانلود از طریق لینک پشتیبانی می‌شوند، اما Blob نهایی در حافظه می‌ماند؛ بنابراین فایل‌های بسیار بزرگ ممکن است شکست بخورند.
- اندازهٔ جعبهٔ `mdat` در MP4 ۳۲ بیتی است، پس هر ویدیو باید **کمتر از ۴ گیگابایت** باشد.
- Playlist **کاملاً متوالی** اجرا می‌شود و URLهای object بین آیتم‌ها آزاد می‌شوند. یک دورهٔ کامل می‌تواند چندین گیگابایت باشد؛ فضای دیسک را در نظر بگیرید.
- استخراج به مرورگری با `DecompressionStream` (Chromium، Firefox و Safari جدید) و دسترسی شبکه به CDN اسپات‌پلیر نیاز دارد.

### ساختار پروژه

```text
spotplayer-downloader/
├─ .github/workflows/deploy.yml   # تست + ساخت + انتشار روی GitHub Pages
├─ public/
│  ├─ bookmarklet.txt             # بوکمارکلت تک‌خطی javascript:
│  └─ favicon.svg
├─ src/
│  ├─ app.ts, main.ts             # پوسته و اتصال اجزا
│  ├─ i18n/fa.ts                  # همهٔ رشته‌های فارسی قابل‌مشاهده
│  ├─ lib/
│  │  ├─ remux.ts                 # تبدیل pure-JS از mp4s به ISO-BMFF
│  │  ├─ spot.ts                  # میزبان‌های CDN، URL بخش‌ها، XOR
│  │  ├─ share.ts                 # رمزگشایی کد اشتراک (SP1: / JSON خام)
│  │  ├─ extract.ts               # دریافت → رمزگشایی → remux
│  │  ├─ queue.ts                 # اجراکنندهٔ متوالی playlist
│  │  └─ download.ts              # نوشتن با FSA + جایگزین لینک
│  ├─ features/                   # ورودی کد، فهرست ویدیوها، پیشرفت، راهنما…
│  ├─ ui/                         # el، dialog، toast، theme
│  └─ styles/app.css              # Tailwind v4 + DaisyUI
├─ index.html
├─ vite.config.ts
└─ package.json
```

### تست و اعتبارسنجی

- تست‌های واحد **Vitest** شامل remuxer (رفت‌وبرگشت با fixture مصنوعی `mp4s`)، رفت‌وبرگشت XOR، رمزگشایی کد اشتراک، استخراج با `fetch` شبیه‌سازی‌شده، صف متوالی، قالب‌بندی اعداد و ماندگاری پوسته است — در حال حاضر **۱۴۷ تست در ۱۷ فایل**.
- هیچ تست خودکار مرورگر/E2E وجود ندارد؛ اعتبارسنجی شامل تست‌های واحد و چک‌لیست دستی بالاست.
- `pnpm build` نوع‌ها را بررسی و یک `dist/` استاتیک تولید می‌کند.

### مجوز

MIT — فایل [LICENSE](./LICENSE) را ببینید.
