/* =========================================================
   MEBELCHI — SOZLAMALAR
   Faqat shu fayldagi qiymatlarni o'zgartirasiz.
   Batafsil yo'riqnoma: README.md
   ========================================================= */

window.MEBELCHI_CONFIG = {

   /* 1) FIREBASE
      Firebase Console → Project settings → Your apps → Web app (</>)
      ichidagi "firebaseConfig" qiymatlarini shu yerga ko'chiring. */
   firebase: {
      apiKey: "AIzaSyB2LPNgM-FVRwSTmlMQZzqzkEF-3YbOMfM",
      authDomain: "mebelchi.firebaseapp.com",
      projectId: "mebelchi",
      storageBucket: "mebelchi.firebasestorage.app",
      messagingSenderId: "675051473022",
      appId: "1:675051473022:web:34e944064fab824af2702f"
   },

   /* 2) CLOUDINARY
      cloudName    — Dashboard'dagi "Cloud name"
      uploadPreset — Settings → Upload → Upload presets → "Unsigned" rejimdagi preset nomi */
   cloudinary: {
      cloudName: "omqssbly",
      uploadPreset: "mebelchi_preset",
      folder: "mebelchi"
   },

   /* 3) TELEGRAM
      telegramUsername — sotuvchining shaxsiy username'i (@ belgisiz). "Sotuvchi bilan bog'lanish" tugmasi shu profilga olib boradi
      telegramGroup    — Telegram guruhingizning taklif havolasi. "Guruhga qo'shilish" tugmasi shunga olib boradi
                         (masalan: "https://t.me/+AbCdEfGh123" yoki "https://t.me/guruh_nomi") */
   telegramUsername: "Islomsher_777",
   telegramGroup: "https://t.me/Namangan_mebelar",

   /* 4) TELEGRAM BOT — konsultatsiya formasidagi so'rovlar shu botga xabar bo'lib keladi
      token  — @BotFather bergan token (masalan: "123456789:AAH...")
      chatId — xabar keladigan chat ID (o'zingiz yoki guruh; guruh ID si "-100..." bilan boshlanadi) */
   telegramBot: {
      token: "9080718787:AAG3AwmytOoIoXOHGWErasGggFp5TE6hu88",    // @BotFather bergan token
      chatId: "5382964932"    // xabar keladigan chat ID
   }
};
