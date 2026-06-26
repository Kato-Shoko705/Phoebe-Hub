// Firebase 配置 - 用户需要替换为自己的配置
const firebaseConfig = {
  apiKey: "AIzaSyDvM-E5LzcP5t1TSuf6BJg-e34tOf8phrI",
  authDomain: "phoebe-hub-db.firebaseapp.com",
  projectId: "phoebe-hub-db",
  storageBucket: "phoebe-hub-db.firebasestorage.app",
  messagingSenderId: "401741086940",
  appId: "1:401741086940:web:10ac6d1b26e5eeb2667419",
  measurementId: "G-TE1NDZTPY1"
};

// 导出配置（兼容模块化使用）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = firebaseConfig;
}
