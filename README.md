# Mebelchi — sozlash yo'riqnomasi

```
mebelchi/
├── index.html          ← sahifa
├── css/style.css       ← dizayn
├── js/config.js        ← SOZLAMALAR (Firebase, Cloudinary, Telegram) — shuni to'ldirasiz
└── js/app.js           ← dastur (katalog, admin, yuklash)
```

`index.html` ni ikki marta bosib ochsangiz ishlaydi. Faqat `css/` va `js/` papkalari yonida turishi shart.
Config to'ldirilmaguncha sayt **demo rejimda** (8 ta namunaviy mebel) ochiladi.

## 1. Firebase Firestore

1. https://console.firebase.google.com → **Add project**
2. **Build → Firestore Database → Create database** (production mode, region: eur3 yoki yaqin)
3. **Project settings (⚙) → Your apps → Web (`</>`)** → ilovani ro'yxatdan o'tkazing
4. Chiqqan `firebaseConfig` qiymatlarini `js/config.js` dagi `firebase: { ... }` ga ko'chiring
5. **Firestore → Rules** bo'limiga quyidagini qo'ying va **Publish** bosing:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /products/{id} { allow read, write: if true; }
    match /settings/{id} { allow read, write: if true; }
    match /leads/{id}    { allow create: if true; allow read: if false; }
  }
}
```

> ⚠️ Admin panel brauzerda tekshiriladi (Firebase Authentication ishlatilmagan), shuning uchun
> `products` va `settings` yozuvlari ochiq turadi. Texnik biladigan odam brauzer konsoli orqali
> mahsulotni o'zgartira oladi. Jiddiy loyiha uchun Firebase Authentication'ga o'ting.

## 2. Cloudinary

1. https://cloudinary.com ga kiring → **Dashboard** dagi **Cloud name** ni nusxalang
2. **Settings (⚙) → Upload → Upload presets → Add upload preset**
3. **Signing mode: Unsigned** qilib saqlang, preset nomini nusxalang
4. `js/config.js` dagi `cloudinary: { cloudName, uploadPreset }` ni to'ldiring

## 3. Telegram

`js/config.js` da:
- `telegramUsername` — sotuvchining shaxsiy username'i (`@` belgisisiz). **"Sotuvchi bilan bog'lanish"** tugmasi shu profilga olib boradi (mebel nomi yozilgan tayyor xabar bilan)
- `telegramGroup` — Telegram guruhingizning taklif havolasi. **"Guruhga qo'shilish"** tugmasi shunga olib boradi

Saytda hech qayerda narx ko'rsatilmaydi: kartochka va galereyada narx o'rnida shu ikki tugma turadi.

## Admin panel

- Footer'ning o'ng pastki burchagida deyarli ko'rinmas **Admin** yozuvi bor (ustiga olib borsangiz yonadi)
- **Birinchi kirish paroli: `admin123`** — kirgach darhol **Parolni o'zgartirish** bo'limidan almashtiring
- Yangi parol Firestore'dagi `settings/admin` hujjatida **SHA-256 xesh** ko'rinishida saqlanadi (ochiq matn emas)
- **Parol maydonidagi ko'zcha (👁)** parolni ko'rsatadi / yashiradi
- **Mebel qo'shish:** nom, kategoriya, kenglik va uzunlik (sm), tavsif va **1 tadan 3 tagacha rasm**.
  Rasmlar tanlanishi bilan Cloudinary'ga o'zi yuklanadi; birinchi rasm — asosiy (boshqasini "Asosiy qilish" bilan almashtirasiz).
  Bazada rasmlar `images: [url1, url2, url3]` massivida, o'lcham `width` va `length` maydonlarida saqlanadi
- **Tahrirlash:** kartochkadagi "Tahrirlash" tugmasi mebel ma'lumotlari va rasmlarini formaga yuklaydi, saqlaganda hujjat yangilanadi (`update`)
- **O'chirish:** kartochkadagi qizil "O'chirish" tugmasi bazadan ham o'chiradi
- **Galereya:** mijoz kartochkaga (rasm yoki matnga) bossa, rasmlar katta oynada ochiladi (← → tugmalari, surish, kichik rasmlar)
- Parolni unutsangiz: Firebase Console → Firestore → `settings` → `admin` hujjatini o'chiring, parol `admin123` ga qaytadi

## Konsultatsiya formasi

Yuborilgan ism va telefon Firestore'dagi `leads` to'plamiga yoziladi (Firebase Console'da ko'rasiz).
