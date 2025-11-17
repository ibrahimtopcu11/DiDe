

const translations = {
  tr: {
    // Common
    application: 'Uygulama',
    close: 'Kapat',
    back: 'Geri',
    cancel: 'İptal',
    save: 'Kaydet',
    delete: 'Sil',
    update: 'Güncelle',
    submit: 'Gönder',
    search: 'Ara',
    selectAll: 'Tümünü Seç',
    yes: 'Evet',
    no: 'Hayır',
    error: 'Hata',
    success: 'Başarılı',
    
    // Site Config
    allowedDomainSingular: 'Kayıt için izin verilen alan: {{domain}}',
    allowedDomainsPlural: 'Kayıt için izin verilen alanlar: {{domains}}',
    
    // Media
    addPhoto: 'Fotoğraf Ekle',
    addVideo: 'Video Ekle',
    photo: 'Fotoğraf',
    video: 'Video',
    noPhoto: 'Fotoğraf yok',
    noVideo: 'Video yok',
    takePhoto: 'Fotoğraf Çek',
    recordVideo: 'Video Kaydet',
    gallery: 'Galeri',
    capture: 'Çek',
    retake: 'Tekrar Çek',
    use: 'Kullan',
    startRecording: 'Kaydı Başlat',
    stopRecording: 'Kaydı Durdur',
    deletePhoto: 'Fotoğrafı Sil',
    deleteVideo: 'Videoyu Sil',
    confirmRemovePhoto: 'Bu fotoğrafı kaldırmak istediğinize emin misiniz?',
    confirmRemoveVideo: 'Bu videoyu kaldırmak istediğinize emin misiniz?',
    photoRemoved: 'Fotoğraf kaldırıldı',
    videoRemoved: 'Video kaldırıldı',
    
    // Location
    location: 'Konum',
    useMyLocation: 'Konumumu Kullan',
    cancelLocation: 'Konumu İptal Et',
    myLocation: 'Konumum',
    selectedLocation: 'Seçili konum',
    stopTracking: 'Takibi Durdur',
    
    // Map Legend
    eventIcons: 'Olay İkonları',
    myEvent: 'Benim Olayım',
    otherEvents: 'Diğer Olaylar',
    withPhoto: 'Fotoğraflı',
    withVideo: 'Videolu',
    withPhotoAndVideo: 'Foto + Video',
    
    // Event Form
    eventReportForm: 'Olay Bildirimi Formu',
    eventType: 'Olay Türü',
    description: 'Açıklama',
    pleaseSelect: 'Seçiniz',
    enterDescription: 'Açıklama girin...',
    latitude: 'Enlem',
    longitude: 'Boylam',
    selectFromMap: 'Haritadan seçin',
    editing: 'Düzenleniyor',
    name: 'Ad',
    surname: 'Soyad',
    
    // Event Types
    type: 'Tür',
    typeName: 'Tür Adı',
    good: 'Faydalı',
    beneficial: 'Faydalı',
    notBeneficial: 'Faydasız',
    beneficialToCitizen: 'Vatandaşa Faydalı',
    notBeneficialToCitizen: 'Vatandaşa Faydasız',
    isBeneficial: 'Vatandaşa faydalı mı?',
    newEventTypeName: 'Yeni olay türü adı',
    add: 'Ekle',
    eventTypes: 'Olay Türleri',
    name: 'Ad',
    createdBy: 'Oluşturan',
    actions: 'İşlemler',
    
    // Users
    users: 'Kullanıcılar',
    username: 'Kullanıcı Adı',
    email: 'E-posta',
    role: 'Rol',
    verified: 'Doğrulandı',
    
    // Events
    events: 'Olaylar',
    addEvent: 'Olay Ekle',
    eventID: 'Olay ID',
    mine: 'Benim',
    other: 'Diğer',
    addedBy: 'Ekleyen',
    addedDate: 'Eklenme Tarihi',
    dateAdded: 'Eklenme Tarihi',
    available: 'Var',
    notAvailable: 'Yok',
    
    // Auth
    login: 'Giriş',
    logout: 'Çıkış',
    signUp: 'Kayıt Ol',
    greeting: 'Merhaba, {{username}} ({{role}})',
    usernameOrEmail: 'Kullanıcı Adı veya E-posta',
    password: 'Parola',
    verificationCode: 'Doğrulama Kodu (2FA)',
    verificationCodeRequired: 'Admin/Supervisor için gerekli',
    forgotPassword: 'Parolamı Unuttum?',
    dontHaveAccount: 'Hesabınız yok mu?',
    alreadyHaveAccount: 'Zaten hesabınız var mı?',
    firstName: 'Ad',
    lastName: 'Soyad',
    resetPassword: 'Parola Sıfırla',
    resetPasswordSteps: 'Parolanızı 3 adımda sıfırlayın: E-posta → Kod → Yeni Parola',
    registeredEmail: 'Kayıtlı e-posta',
    sendCode: 'Kod Gönder',
    verifyCode: 'Kodu Doğrula',
    newPassword: 'Yeni Parola',
    confirmNewPassword: 'Yeni Parolayı Onayla',
    backToLogin: 'Giriş Ekranına Dön',
    
    // Admin Panel
    administrationPanel: 'Yönetim Paneli',
    managementPanel: 'Yönetim Paneli',
    view: 'Görünüm',
    management: 'Yönetim',
    eventView: 'Olay Görünümü',
    
    // Filters
    searchPlaceholder: 'Ara: Mayıs, 2025, 14 Mayıs 2025, 01:00...',
    searchCommonWord: 'Ara: ortak kelime...',
    newestFirst: 'En Son Eklenen Başta',
    oldestFirst: 'İlk Eklenen Başta',
    customFilters: 'Özel Filtreler',
    emailDomains: 'E-posta Domain\'leri',
    
    // Date Filters
    yearFilter: '{{year}} Yılı',
    monthFilter: '{{month}} Ayı',
    dayFilter: '{{day}}. Gün',
    yearRangeFilter: '{{start}} - {{end}} Yılları Arası',
    dayRangeFilter: '{{start}} - {{end}}. Günler Arası',
    timeRangeFilter: '{{start}} - {{end}} Arası',
    
    // Months
    months: ['ocak', 'şubat', 'mart', 'nisan', 'mayıs', 'haziran', 'temmuz', 'ağustos', 'eylül', 'ekim', 'kasım', 'aralık'],
    
    // Pagination
    showingTotalRecords: 'Toplam {{total}} kayıt gösteriliyor',
    showingFilteredRecords: 'Toplam {{total}} kayıttan {{filtered}} kayıt gösteriliyor',
    showingRangeRecords: '{{start}}-{{end}} arası gösteriliyor (Toplam: {{total}})',
    showingRangeFilteredRecords: '{{start}}-{{end}} arası gösteriliyor (Toplam {{total}} kayıttan {{filtered}} kayıt)',
    
    // Messages
    noRecordsFound: 'Kayıt bulunamadı',
    noEventsToDownload: 'İndirilecek olay yok',
    eventsDownloaded: 'Olaylar indirildi',
    geojsonDownloaded: 'GeoJSON indirildi',
    geojsonDownloadFailed: 'GeoJSON indirilemedi',
    downloadError: 'İndirme hatası',
    download: 'İndir',
    downloadFilteredEventsGeoJSON: 'Filtrelenmiş olayları GeoJSON olarak indir',
    downloadVisibleEventsGeoJSON: 'Haritada görünen olayları GeoJSON indir',
    
    // Validation
    pleaseEnterTypeName: 'Lütfen tür adı girin',
    pleaseEnterLocation: 'Lütfen konum girin',
    pleaseSelectEventType: 'Lütfen bir olay türü seçin',
    usernamePasswordRequired: 'Kullanıcı adı ve parola zorunludur',
    usernameEmailPasswordRequired: 'Kullanıcı adı, e-posta ve parola zorunludur',
    emailRequired: 'E-posta zorunludur',
    emailCodeRequired: 'E-posta ve kod zorunludur',
    fillAllFields: 'Tüm alanları doldurun',
    passwordsDoNotMatch: 'Parolalar eşleşmiyor',
    weakPassword: 'Zayıf parola: En az 8 karakter, bir büyük, bir küçük harf ve bir sembol içermeli',
    typeNameRequired: 'Olay türü adı boş olamaz',
    noChanges: 'Değişiklik yapılmadı',
    noPermission: 'Yetkiniz yok',
    
    // Success Messages
    loginSuccessful: 'Giriş başarılı',
    registrationSuccessfulCheckEmail: 'Kayıt başarılı! Lütfen e-postanızı kontrol edin (varsa doğrulama için)',
    verificationCodeSent: 'Doğrulama kodu e-postanıza gönderildi (5 dk geçerli)',
    codeVerifiedEnterNewPassword: 'Kod doğrulandı, yeni parolanızı girin',
    passwordResetSuccessCanLogin: 'Parolanız sıfırlandı! Giriş yapabilirsiniz',
    newTypeAdded: 'Yeni olay türü eklendi',
    typeUpdated: 'Olay türü güncellendi',
    typeDeleted: 'Olay türü silindi',
    userDeleted: 'Kullanıcı silindi',
    eventAdded: 'Olay eklendi (#{{id}})',
    eventUpdated: 'Olay güncellendi (#{{id}})',
    eventDeleted: 'Olay silindi',
    videoAdded: 'Video eklendi',
    
    // Error Messages
    unknownError: 'Bilinmeyen hata',
    loginFailed: 'Giriş başarısız',
    loginError: 'Giriş hatası',
    registrationFailed: 'Kayıt başarısız',
    registrationError: 'Kayıt hatası',
    codeNotSent: 'Kod gönderilemedi',
    codeNotVerified: 'Kod doğrulanamadı',
    passwordNotReset: 'Parola sıfırlanamadı',
    eventTypesLoadFailed: 'Olay türleri yüklenemedi',
    typeAddFailed: 'Olay türü eklenemedi',
    duplicateTypeError: 'Aynı ad ile olay türü ekleyemezsiniz (Aktif veya pasif bir kayıt mevcut)',
    updateFailed: 'Güncelleme başarısız',
    updateError: 'Güncelleme hatası',
    deleteFailed: 'Silme başarısız',
    deleteError: 'Silme hatası',
    operationError: 'İşlem hatası',
    readError: 'Okuma hatası',
    uploadError: 'Yükleme hatası',
    photoUploadFailed: 'Foto yüklenemedi',
    videoUploadFailed: 'Video yüklenemedi',
    videoUploadError: 'Video yükleme hatası',
    invalidResponse: 'Geçersiz yanıt',
    
    // Confirmations
    confirmDeleteEvent: 'Olay silinsin mi?',
    confirmDeleteType: 'Bu tür ve bağlı olaylar silinsin mi?',
    confirmDeleteUser: 'Kullanıcı silinsin mi?',
    confirmDeleteOwnAccount: 'Kendi hesabınızı silmek istediğinize emin misiniz?',
    accountDeactivatedRedirect: 'Hesabınız pasifleştirildi. Giriş ekranına yönlendiriliyorsunuz.',
    
    // Camera/Recording
    cameraPermissionDenied: 'Kamera izni reddedildi veya bulunamadı. Galeriden seçebilirsiniz.',
    cameraNotOpened: 'Kamera açılmadı',
    videoRecordingNotSupported: 'Cihaz video kaydı desteklemiyor. Galeriden video seçin',
    recordingStartFailed: 'Kayıt başlatılamadı',
    videoRecordingError: 'Video kaydında hata',
    recordingNotCreated: 'Kayıt oluşmadı, tekrar deneyin',
    
    // Speech Recognition
    voiceToText: 'Sesle yaz',
    microphone: 'Mikrofon',
    browserNoSpeechRecognition: 'Tarayıcı konuşma tanımıyor',
    
    // Supervisor
    supervisorCannotAdd: 'Supervisor ekleyemez',
    
    // Other
    pleaseEnterVerificationCode: 'Lütfen doğrulama kodunu girin'
  },
  
  en: {
    // Common
    application: 'Application',
    close: 'Close',
    back: 'Back',
    cancel: 'Cancel',
    save: 'Save',
    delete: 'Delete',
    update: 'Update',
    submit: 'Submit',
    search: 'Search',
    selectAll: 'Select All',
    yes: 'Yes',
    no: 'No',
    error: 'Error',
    success: 'Success',
    
    // Site Config
    allowedDomainSingular: 'Allowed domain for registration: {{domain}}',
    allowedDomainsPlural: 'Allowed domains for registration: {{domains}}',
    
    // Media
    addPhoto: 'Add Photo',
    addVideo: 'Add Video',
    photo: 'Photo',
    video: 'Video',
    noPhoto: 'No photo',
    noVideo: 'No video',
    takePhoto: 'Take Photo',
    recordVideo: 'Record Video',
    gallery: 'Gallery',
    capture: 'Capture',
    retake: 'Retake',
    use: 'Use',
    startRecording: 'Start Recording',
    stopRecording: 'Stop Recording',
    deletePhoto: 'Delete Photo',
    deleteVideo: 'Delete Video',
    confirmRemovePhoto: 'Are you sure you want to remove this photo?',
    confirmRemoveVideo: 'Are you sure you want to remove this video?',
    photoRemoved: 'Photo removed',
    videoRemoved: 'Video removed',
    
    // Location
    location: 'Location',
    useMyLocation: 'Use My Location',
    cancelLocation: 'Cancel Location',
    myLocation: 'My Location',
    selectedLocation: 'Selected location',
    stopTracking: 'Stop Tracking',
    
    // Map Legend
    eventIcons: 'Event Icons',
    myEvent: 'My Event',
    otherEvents: 'Other Events',
    withPhoto: 'With Photo',
    withVideo: 'With Video',
    withPhotoAndVideo: 'Photo + Video',
    
    // Event Form
    eventReportForm: 'Event Report Form',
    eventType: 'Event Type',
    description: 'Description',
    pleaseSelect: 'Please Select',
    enterDescription: 'Enter description...',
    latitude: 'Latitude',
    longitude: 'Longitude',
    selectFromMap: 'Select from map',
    editing: 'Editing',
    name: 'Name',
    surname: 'Surname',
    
    // Event Types
    type: 'Type',
    good: 'Beneficial',
    typeName: 'Type Name',
    beneficial: 'Beneficial',
    notBeneficial: 'Not Beneficial',
    beneficialToCitizen: 'Beneficial to Citizen',
    notBeneficialToCitizen: 'Not Beneficial to Citizen',
    isBeneficial: 'Is it beneficial to citizens?',
    newEventTypeName: 'New event type name',
    add: 'Add',
    eventTypes: 'Event Types',
    name: 'Name',
    createdBy: 'Created By',
    actions: 'Actions',
    
    // Users
    users: 'Users',
    username: 'Username',
    email: 'Email',
    role: 'Role',
    verified: 'Verified',
    
    // Events
    events: 'Events',
    addEvent: 'Add Event',
    eventID: 'Event ID',
    mine: 'Mine',
    other: 'Other',
    addedBy: 'Added By',
    dateAdded: 'Date Added',
    available: 'Available',
    notAvailable: 'Not Available',
    
    // Auth
    login: 'Login',
    logout: 'Logout',
    signUp: 'Sign Up',
    greeting: 'Hello, {{username}} ({{role}})',
    usernameOrEmail: 'Username or Email',
    password: 'Password',
    verificationCode: 'Verification Code (2FA)',
    verificationCodeRequired: 'Required for Admin/Supervisor',
    forgotPassword: 'Forgot Password?',
    dontHaveAccount: "Don't have an account?",
    alreadyHaveAccount: 'Already have an account?',
    firstName: 'First Name',
    lastName: 'Last Name',
    resetPassword: 'Reset Password',
    resetPasswordSteps: 'Reset your password in 3 steps: Email → Code → New Password',
    registeredEmail: 'Registered email',
    sendCode: 'Send Code',
    verifyCode: 'Verify Code',
    newPassword: 'New Password',
    confirmNewPassword: 'Confirm New Password',
    backToLogin: 'Back to Login',
    
    // Admin Panel
    administrationPanel: 'Administration Panel',
    managementPanel: 'Management Panel',
    view: 'View',
    management: 'Management',
    eventView: 'Event View',
    
    // Filters
    searchPlaceholder: 'Search: May, 2025, May 14 2025, 01:00...',
    searchCommonWord: 'Search: common word...',
    newestFirst: 'Newest First',
    oldestFirst: 'Oldest First',
    customFilters: 'Custom Filters',
    emailDomains: 'Email Domains',
    
    // Date Filters
    yearFilter: 'Year {{year}}',
    monthFilter: '{{month}} Month',
    dayFilter: 'Day {{day}}',
    yearRangeFilter: 'Years {{start}} - {{end}}',
    dayRangeFilter: 'Days {{start}} - {{end}}',
    timeRangeFilter: '{{start}} - {{end}}',
    
    // Months
    months: ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'],
    
    // Pagination
    showingTotalRecords: 'Showing {{total}} total records',
    showingFilteredRecords: 'Showing {{filtered}} of {{total}} total records',
    showingRangeRecords: 'Showing {{start}}-{{end}} (Total: {{total}})',
    showingRangeFilteredRecords: 'Showing {{start}}-{{end}} ({{filtered}} of {{total}} total records)',
    
    // Messages
    noRecordsFound: 'No records found',
    noEventsToDownload: 'No events to download',
    eventsDownloaded: 'Events downloaded',
    geojsonDownloaded: 'GeoJSON downloaded',
    geojsonDownloadFailed: 'GeoJSON download failed',
    downloadError: 'Download error',
    download: 'Download',
    downloadFilteredEventsGeoJSON: 'Download filtered events as GeoJSON',
    downloadVisibleEventsGeoJSON: 'Download visible events on map as GeoJSON',
    
    // Validation
    pleaseEnterTypeName: 'Please enter type name',
    pleaseEnterLocation: 'Please enter location',
    pleaseSelectEventType: 'Please select an event type',
    usernamePasswordRequired: 'Username and password are required',
    usernameEmailPasswordRequired: 'Username, email and password are required',
    emailRequired: 'Email is required',
    emailCodeRequired: 'Email and code are required',
    fillAllFields: 'Fill all fields',
    passwordsDoNotMatch: 'Passwords do not match',
    weakPassword: 'Weak password: Must contain at least 8 characters, one uppercase, one lowercase letter and one special character',
    typeNameRequired: 'Event type name cannot be empty',
    noChanges: 'No changes made',
    noPermission: 'No permission',
    
    // Success Messages
    loginSuccessful: 'Login successful',
    registrationSuccessfulCheckEmail: 'Registration successful! Please check your email (if verification is required)',
    verificationCodeSent: 'Verification code sent to your email (valid for 5 minutes)',
    codeVerifiedEnterNewPassword: 'Code verified, enter your new password',
    passwordResetSuccessCanLogin: 'Password reset! You can now login',
    newTypeAdded: 'New event type added',
    typeUpdated: 'Event type updated',
    typeDeleted: 'Event type deleted',
    userDeleted: 'User deleted',
    eventAdded: 'Event added (#{{id}})',
    eventUpdated: 'Event updated (#{{id}})',
    eventDeleted: 'Event deleted',
    videoAdded: 'Video added',
    
    // Error Messages
    unknownError: 'Unknown error',
    loginFailed: 'Login failed',
    loginError: 'Login error',
    registrationFailed: 'Registration failed',
    registrationError: 'Registration error',
    codeNotSent: 'Code could not be sent',
    codeNotVerified: 'Code could not be verified',
    passwordNotReset: 'Password could not be reset',
    eventTypesLoadFailed: 'Event types could not be loaded',
    typeAddFailed: 'Event type could not be added',
    duplicateTypeError: 'Cannot add event type with the same name (An active or inactive record already exists)',
    updateFailed: 'Update failed',
    updateError: 'Update error',
    deleteFailed: 'Delete failed',
    deleteError: 'Delete error',
    operationError: 'Operation error',
    readError: 'Read error',
    uploadError: 'Upload error',
    photoUploadFailed: 'Photo upload failed',
    videoUploadFailed: 'Video upload failed',
    videoUploadError: 'Video upload error',
    invalidResponse: 'Invalid response',
    
    // Confirmations
    confirmDeleteEvent: 'Delete event?',
    confirmDeleteType: 'Delete this type and related events?',
    confirmDeleteUser: 'Delete user?',
    confirmDeleteOwnAccount: 'Are you sure you want to delete your own account?',
    accountDeactivatedRedirect: 'Your account has been deactivated. Redirecting to login screen.',
    
    // Camera/Recording
    cameraPermissionDenied: 'Camera permission denied or not found. You can select from gallery.',
    cameraNotOpened: 'Camera not opened',
    videoRecordingNotSupported: 'Device does not support video recording. Select video from gallery',
    recordingStartFailed: 'Recording could not be started',
    videoRecordingError: 'Video recording error',
    recordingNotCreated: 'Recording not created, try again',
    
    // Speech Recognition
    voiceToText: 'Voice to Text',
    microphone: 'Microphone',
    browserNoSpeechRecognition: 'Browser does not support speech recognition',
    
    // Supervisor
    supervisorCannotAdd: 'Supervisor cannot add',
    
    // Other
    pleaseEnterVerificationCode: 'Please enter verification code'
  }
};

// Default language
let currentLanguage = 'tr';

// Helper function for template replacement
function replacePlaceholders(str, params) {
  if (!params) return str;
  return str.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return params[key] !== undefined ? params[key] : match;
  });
}

// Translation function
function t(key, params) {
  const keys = key.split('.');
  let value = translations[currentLanguage];
  
  for (const k of keys) {
    if (value && typeof value === 'object') {
      value = value[k];
    } else {
      break;
    }
  }
  
  if (typeof value === 'string') {
    return replacePlaceholders(value, params);
  }
  
  // Fallback to Turkish if key not found
  if (currentLanguage !== 'tr') {
    let fallback = translations['tr'];
    for (const k of keys) {
      if (fallback && typeof fallback === 'object') {
        fallback = fallback[k];
      } else {
        break;
      }
    }
    if (typeof fallback === 'string') {
      return replacePlaceholders(fallback, params);
    }
  }
  
  // If still not found, return the key itself
  return key;
}

// Set language function
function setLanguage(lang) {
  if (translations[lang]) {
    currentLanguage = lang;
    try {
      localStorage.setItem('app_language', lang);
    } catch {}
    
    // Update HTML lang attribute
    document.documentElement.lang = lang;
    
    // Trigger a custom event for language change
    window.dispatchEvent(new CustomEvent('languagechange', { detail: { language: lang } }));
  }
}

// Get current language
function getLanguage() {
  return currentLanguage;
}

// Initialize language from localStorage
function initLanguage() {
  try {
    const saved = localStorage.getItem('app_language');
    if (saved && translations[saved]) {
      currentLanguage = saved;
      document.documentElement.lang = saved;
    }
  } catch {}
}


// Export to window FIRST
window.t = t;
window.setLanguage = setLanguage;
window.getLanguage = getLanguage;
window.i18n = {
  t,
  setLanguage,
  getLanguage,
  translations
};

// Then auto-initialize
initLanguage();

// Trigger DOMContentLoaded event if needed
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('i18n loaded and ready');
  });
} else {
  console.log('i18n loaded and ready');
}