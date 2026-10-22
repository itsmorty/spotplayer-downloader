/**
 * Persian UI strings — the single source of every user-visible label.
 *
 * The app is Persian-only, so components must never hard-code text. Keep
 * technical values (sizes, durations, percentages, row numbers) in Latin
 * digits, and use the phrase helpers at the bottom for counts.
 */

import type { ShareCodeErrorCode } from '../lib/share'

const shareCodeErrors = {
  'invalid-format':
    'قالب کد اشتراک معتبر نیست. کد را کامل کپی کنید یا فایل درست را انتخاب کنید.',
  'gzip-failed': 'باز کردن کد فشرده‌شده ممکن نشد. کد را دوباره از مبدأ کپی کنید.',
  'missing-field': 'کد اشتراک ناقص است و برخی اطلاعات لازم را ندارد.',
  'invalid-video': 'اطلاعات ویدیوها در کد اشتراک معتبر نیست.',
} satisfies Record<ShareCodeErrorCode, string>

export const fa = {
  brand: {
    title: 'استخراج‌کنندهٔ دورهٔ اسپات‌پلیر',
    short: 'استخراج‌کنندهٔ دوره',
    tagline: 'ویدیوهای دوره را مستقیم در مرورگر ذخیره کنید',
  },
  nav: {
    help: 'راهنما',
    helpHint: 'راهنمای استفاده و دریافت کد اشتراک',
    skipToContent: 'رفتن به محتوای اصلی',
  },
  theme: {
    toggle: 'تغییر پوسته',
    switchToDark: 'تغییر به پوستهٔ تاریک',
    switchToLight: 'تغییر به پوستهٔ روشن',
    light: 'روشن',
    dark: 'تاریک',
  },
  footer: {
    privacy:
      'همهٔ پردازش در مرورگر شما انجام می‌شود؛ کد اشتراک و اطلاعات دوره هرگز به سرور ارسال نمی‌شود.',
    ownership: 'فقط برای دوره‌هایی که به‌طور قانونی خریده‌اید.',
    independent: 'ابزار مستقل برای استفادهٔ شخصی',
  },
  disclaimer: {
    title: 'استفادهٔ مسئولانه',
    body: 'این ابزار فقط برای دوره‌هایی است که به‌طور قانونی خریده‌اید. کد اشتراک و اطلاعات دوره فقط در مرورگر شما پردازش می‌شود و هیچ داده‌ای به سرور ارسال نمی‌شود.',
    short: 'فقط برای دوره‌هایی که به‌طور قانونی خریده‌اید.',
    accept: 'متوجه شدم',
  },
  shareCode: {
    step: '1',
    title: 'بارگذاری کد اشتراک',
    hint: 'کد اشتراک را بچسبانید یا فایل آن را انتخاب کنید. پردازش کاملاً محلی است.',
    label: 'کد اشتراک',
    placeholder: 'SP1:…',
    inputAria: 'کد اشتراک اسپات‌پلیر',
    load: 'بارگذاری',
    loading: 'در حال خواندن کد…',
    chooseFile: 'انتخاب فایل',
    dropHere: 'یا فایل کد را اینجا رها کنید',
    dropActive: 'برای بارگذاری رها کنید',
    fileTooLarge: 'حجم فایل بیش از 20 مگابایت است.',
    fileReadError: 'خواندن فایل ممکن نشد.',
    fileEmpty: 'فایل انتخاب‌شده خالی است.',
    empty: 'کد اشتراک را وارد کنید.',
    shortcut: 'میانبر: Ctrl + Enter',
    success: 'کد اشتراک بارگذاری شد.',
  },
  course: {
    label: 'دورهٔ بارگذاری‌شده',
    nameLabel: 'نام دوره',
    unnamed: 'دورهٔ بدون نام',
    videosLabel: 'تعداد ویدیوها',
    sizeLabel: 'حجم کل',
  },
  videos: {
    title: 'ویدیوهای دوره',
    tableAria: 'فهرست ویدیوهای دوره',
    row: 'ردیف',
    name: 'نام ویدیو',
    duration: 'مدت',
    size: 'حجم',
    status: 'وضعیت',
    selectAll: 'انتخاب همه',
    selectNone: 'لغو انتخاب همه',
    selectAllAria: 'انتخاب همهٔ ویدیوها',
    selectNoneAria: 'لغو انتخاب همهٔ ویدیوها',
    selectRow: (name: string) => `انتخاب «${name}»`,
    emptyNoCode: 'برای شروع، کد اشتراک را وارد کنید',
    emptyNoVideos: 'این دوره هیچ ویدیویی ندارد.',
    noCodeHint: 'پس از بارگذاری کد، فهرست ویدیوها اینجا نمایش داده می‌شود.',
    statusAria: (label: string) => `وضعیت: ${label}`,
  },
  selection: {
    title: 'اقدام‌ها',
    extractOne: 'استخراج ویدیوی انتخاب‌شده',
    downloadAll: 'دانلود همهٔ انتخاب‌شده‌ها',
    none: 'هیچ ویدیویی انتخاب نشده است',
    hintNone: 'برای ادامه، دست‌کم یک ویدیو انتخاب کنید.',
    hintOne: 'یک ویدیو انتخاب شده است؛ آمادهٔ استخراج.',
    hintMany:
      'برای استخراج تکی، فقط یک ویدیو انتخاب کنید. برای دانلود گروهی می‌توانید چند ویدیو انتخاب کنید.',
    selectedSize: 'حجم انتخاب‌شده',
  },
  progress: {
    title: 'پیشرفت استخراج',
    phase: {
      download: 'دریافت بخش‌ها',
      decrypt: 'رمزگشایی',
      remux: 'ساخت فایل MP4',
    },
    cancel: 'لغو',
    overall: 'پیشرفت کلی',
    itemOf: (n: number, total: number) => itemOf(n, total),
    percentLabel: 'درصد',
    preparing: 'در حال آماده‌سازی…',
    saving: 'در حال ذخیرهٔ فایل…',
    cancelling: 'در حال لغو…',
    starting: 'در حال شروع…',
    waiting: 'در انتظار',
  },
  status: {
    idle: 'آماده',
    pending: 'در انتظار',
    running: 'در حال انجام',
    done: 'انجام شد',
    error: 'خطا',
    aborted: 'لغو شد',
  },
  result: {
    title: 'نتیجهٔ استخراج',
    preview: 'پیش‌نمایش ویدیو',
    videoAria: 'پیش‌نمایش ویدیوی استخراج‌شده',
    duration: 'مدت',
    size: 'حجم فایل',
    download: 'دانلود فایل',
    saved: 'فایل ذخیره شد',
    empty: 'هنوز فایل استخراج‌شده‌ای وجود ندارد.',
  },
  errors: {
    unknown: 'خطای ناشناخته‌ای رخ داد. دوباره تلاش کنید.',
    shareCode: shareCodeErrors,
    network: 'اتصال به سرور برقرار نشد. اتصال اینترنت را بررسی کنید.',
    http: (status: number) => `سرور با خطای HTTP ${status} پاسخ داد.`,
    aborted: 'عملیات لغو شد.',
    sizeMismatch: 'حجم دادهٔ دریافتی با فایل مورد انتظار هم‌خوانی ندارد.',
    unsupportedContainer: 'ساختار فایل این ویدیو پشتیبانی نمی‌شود.',
    unsupportedFraming: 'چیدمان بخش‌های این ویدیو پشتیبانی نمی‌شود.',
    remux: 'ساخت فایل MP4 ممکن نشد.',
    emptyVideo: 'این ویدیو داده‌ای برای استخراج ندارد.',
    savePermission: 'اجازهٔ ذخیرهٔ فایل داده نشد.',
    save: 'ذخیرهٔ فایل ممکن نشد.',
    copy: 'کپی در حافظه ممکن نشد.',
  },
  toast: {
    codeLoaded: 'کد اشتراک بارگذاری شد.',
    extractDone: 'استخراج ویدیو کامل شد.',
    extractFailed: 'استخراج ویدیو با خطا مواجه شد.',
    queueDone: 'همهٔ ویدیوهای انتخاب‌شده ذخیره شدند.',
    queueAborted: 'دانلود گروهی لغو شد.',
    saved: 'فایل ذخیره شد.',
    saveCancelled: 'ذخیرهٔ فایل لغو شد.',
    copied: 'در حافظه کپی شد.',
    copyFailed: 'کپی ممکن نشد.',
  },
  help: {
    title: 'راهنمای استفاده',
    intro:
      'این ابزار ویدیوهای دوره‌ای را که خریده‌اید، مستقیم در مرورگر به فایل MP4 تبدیل می‌کند.',
    steps: [
      'کد اشتراک را با بوکمارکلت بگیرید یا فایل آن را بارگذاری کنید.',
      'ویدیو یا ویدیوهای موردنظر را در فهرست انتخاب کنید.',
      'دکمهٔ استخراج یا دانلود را بزنید و منتظر پایان پردازش بمانید.',
      'فایل ساخته‌شده را روی دستگاه خود ذخیره کنید.',
    ],
    bookmarkletTitle: 'دریافت کد اشتراک',
    bookmarkletHint:
      'بوکمارکلت را روی نوار نشانک‌ها بکشید و در صفحهٔ دورهٔ اسپات‌پلیر اجرا کنید.',
    copyBookmarklet: 'کپی بوکمارکلت',
    copiedBookmarklet: 'بوکمارکلت کپی شد.',
    close: 'بستن',
  },
  common: {
    close: 'بستن',
    cancel: 'لغو',
    retry: 'تلاش دوباره',
    clear: 'پاک کردن',
    copy: 'کپی',
    loading: 'در حال بارگذاری…',
  },
  units: {
    megabyte: 'مگابایت',
    gigabyte: 'گیگابایت',
    second: 'ثانیه',
    minute: 'دقیقه',
    hour: 'ساعت',
  },
} as const

/** Latin digits with thousands separators; negative/non-finite values clamp to 0. */
function count(value: number): string {
  const safe = Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0
  return safe.toLocaleString('en-US')
}

/** `68` → «68 ویدیو». */
export function videosCount(n: number): string {
  return `${count(n)} ویدیو`
}

/** `3` → «3 ویدیو انتخاب شده». */
export function selectedCount(n: number): string {
  return `${count(n)} ویدیو انتخاب شده`
}

/** `3, 68` → «ویدیوی 3 از 68» for playlist progress. */
export function itemOf(n: number, total: number): string {
  return `ویدیوی ${count(n)} از ${count(total)}`
}
