// 初始化 Firebase
let db = null;
let auth = null;
let firebaseApp = null;
let firebaseEnabled = false;

try {
    if (typeof firebase !== 'undefined' && firebaseConfig && firebaseConfig.projectId !== 'YOUR_PROJECT_ID') {
        firebaseApp = firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
        auth = firebase.auth();
        firebaseEnabled = true;
        console.log('Firebase 已连接');
    } else {
        console.warn('Firebase 未配置，使用本地数据');
    }
} catch (e) {
    console.error('Firebase 初始化失败:', e);
}

// 本地备用数据
let localMemesData = [];
let memesData = [];
let pendingData = [];
let currentCategory = 'all';
let currentSort = 'newest';
let searchQuery = '';
let nextId = 5;
let isAdmin = false;
let dataLoaded = false;
let currentUser = null;

// 批量上传相关
let batchFiles = [];
let selectedPendingIds = new Set();
let selectedMemeIds = new Set();
let currentUploadHash = null; // 当前待上传图片的感知哈希

// 上传安全限制配置
const UPLOAD_CONFIG = {
    allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    maxFileSize: 10 * 1024 * 1024, // 10MB
    maxBatchCount: 20,
    cooldownMs: 60 * 1000, // 60秒
    maxUploadsPerDay: 10,
    maxTitleLength: 50
};

const CATEGORY_LABELS = {
    'cute': '超可爱',
    'ai': 'AI创作',
    'static': '静态图',
    'gif': '动态图'
};

const TAG_LABELS = {
    'featured': '精选',
    'recommended': '站长推荐'
};

// XSS 转义
function escapeHtml(text) {
    if (text == null) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// 验证单个文件
function validateFile(file) {
    if (!file) return '请选择图片文件';
    if (!UPLOAD_CONFIG.allowedTypes.includes(file.type)) {
        return `不支持的文件类型: ${file.type || '未知'}，仅支持 JPG/PNG/GIF/WebP`;
    }
    if (file.size > UPLOAD_CONFIG.maxFileSize) {
        return `文件过大: ${(file.size / 1024 / 1024).toFixed(2)}MB，最大允许 ${UPLOAD_CONFIG.maxFileSize / 1024 / 1024}MB`;
    }
    return null;
}

// 检查上传频率限制（管理员不受限制）
function checkUploadLimit(count = 1) {
    if (isAdmin) return null;

    const now = Date.now();
    const storageKey = 'phoebeUploadHistory';
    let history = [];
    try {
        const raw = localStorage.getItem(storageKey);
        if (raw) history = JSON.parse(raw);
        if (!Array.isArray(history)) history = [];
    } catch (e) {
        history = [];
    }

    // 只保留最近 24 小时的记录
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    history = history.filter(t => t > oneDayAgo);

    // 检查单日上限
    if (history.length + count > UPLOAD_CONFIG.maxUploadsPerDay) {
        return `今天已上传 ${history.length} 张，最多还能上传 ${Math.max(0, UPLOAD_CONFIG.maxUploadsPerDay - history.length)} 张`;
    }

    // 检查冷却时间
    const lastUpload = history.length > 0 ? history[history.length - 1] : 0;
    if (now - lastUpload < UPLOAD_CONFIG.cooldownMs) {
        const waitSeconds = Math.ceil((UPLOAD_CONFIG.cooldownMs - (now - lastUpload)) / 1000);
        return `上传太频繁，请 ${waitSeconds} 秒后再试`;
    }

    return null;
}

// 记录上传尝试
function recordUploadAttempt(count = 1) {
    const storageKey = 'phoebeUploadHistory';
    let history = [];
    try {
        const raw = localStorage.getItem(storageKey);
        if (raw) history = JSON.parse(raw);
        if (!Array.isArray(history)) history = [];
    } catch (e) {
        history = [];
    }
    const now = Date.now();
    history = history.filter(t => t > now - 24 * 60 * 60 * 1000);
    for (let i = 0; i < count; i++) {
        history.push(now);
    }
    try {
        localStorage.setItem(storageKey, JSON.stringify(history));
    } catch (e) {
        // localStorage 不可用则忽略
    }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    createParticles();
    renderCharacters();
    initUploadModal();
    initAdminPanel();
    initAuthListener();
    initLazyLoad();
    loadData();
    initBatchUpload();
});

// 监听 Firebase 登录状态
function initAuthListener() {
    if (!auth) return;

    auth.onAuthStateChanged(user => {
        currentUser = user;
        isAdmin = !!user;

        if (user) {
            console.log('管理员已登录:', user.email);
            closeLoginModal();
            refreshPendingList().then(() => renderAdminPanel());
        } else {
            console.log('未登录管理员');
            const panel = document.getElementById('adminPanel');
            if (panel) panel.classList.remove('active');
        }

        renderMemes();
    });
}

// 从 Firebase 加载公开数据
async function loadData() {
    if (firebaseEnabled) {
        try {
            // 读取已发布的表情包（所有人可读）
            const memesSnapshot = await db.collection('memes').orderBy('createdAt', 'desc').get();
            memesData = memesSnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    firebaseId: doc.id,
                    title: data.title,
                    url: data.url,
                    category: data.category || ['cute'],
                    views: data.views || 0,
                    downloads: data.downloads || 0,
                    date: data.date || new Date().toISOString().split('T')[0],
                    isGif: data.isGif || false,
                    hot: data.hot || 0,
                    tags: data.tags || [],
                    hash: data.hash || null,
                    createdAt: data.createdAt ? data.createdAt.toDate() : new Date()
                };
            });

            dataLoaded = true;
            console.log('从 Firebase 加载表情包成功');
        } catch (e) {
            console.error('从 Firebase 加载表情包失败:', e);
            useLocalData();
        }
    } else {
        useLocalData();
    }

    renderMemes();
    updateHotList();
}

// 加载待审核数据（仅管理员）
async function loadPendingData() {
    if (!firebaseEnabled || !isAdmin) return;

    try {
        const pendingSnapshot = await db.collection('pending').orderBy('createdAt', 'desc').get();
        pendingData = pendingSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                firebaseId: doc.id,
                title: data.title,
                url: data.url,
                category: data.category || ['cute'],
                views: data.views || 0,
                downloads: data.downloads || 0,
                date: data.date || new Date().toISOString().split('T')[0],
                isGif: data.isGif || false,
                hot: data.hot || 0,
                tags: data.tags || [],
                hash: data.hash || null,
                createdAt: data.createdAt ? data.createdAt.toDate() : new Date()
            };
        });

        console.log('从 Firebase 加载待审核数据成功');
    } catch (e) {
        console.error('从 Firebase 加载待审核数据失败:', e);
    }
}

// 使用本地备用数据
function useLocalData() {
    memesData = [
        {
            id: 1,
            title: "誓死效忠米哈游",
            url: "images/誓死效忠米哈游.jpg",
            category: ["meme"],
            views: 15234,
            downloads: 3421,
            date: "2025-06-15",
            isGif: false,
            hot: 98
        },
        {
            id: 2,
            title: "菲比猪鼻",
            url: "images/菲比猪鼻.jpg",
            category: ["cute"],
            views: 28567,
            downloads: 5623,
            date: "2025-06-14",
            isGif: false,
            hot: 100
        },
        {
            id: 3,
            title: "你这无礼之徒",
            url: "images/你这无礼之徒.jpg",
            category: ["meme"],
            views: 19876,
            downloads: 4456,
            date: "2025-06-13",
            isGif: false,
            hot: 95
        },
        {
            id: 4,
            title: "少爷，该启动鸣潮了哈哈",
            url: "images/少爷，该启动鸣潮了哈哈.jpg",
            category: ["cute"],
            views: 32109,
            downloads: 6789,
            date: "2025-06-12",
            isGif: false,
            hot: 99
        }
    ];
    dataLoaded = true;
}

// 创建粒子背景
function createParticles() {
    const container = document.getElementById('particles');
    if (!container) return;
    for (let i = 0; i < 20; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.animationDelay = Math.random() * 15 + 's';
        particle.style.animationDuration = (10 + Math.random() * 10) + 's';
        particle.style.width = (5 + Math.random() * 10) + 'px';
        particle.style.height = particle.style.width;
        container.appendChild(particle);
    }
}

// 渲染角色列表
function renderCharacters() {
    const grid = document.getElementById('characterGrid');
    if (!grid) return;
    grid.innerHTML = `
        <div class="character-item" onclick="filterByCharacter('菲比')">
            <img src="images/top.png" alt="菲比" class="character-avatar" style="border-color: #B794F6" onerror="this.src='https://via.placeholder.com/100x100/B794F6/FFFFFF?text=菲比'">
            <div class="character-name">菲比</div>
            <div class="character-role">教士</div>
        </div>
    `;
}

// 图片懒加载
function initLazyLoad() {
    const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                const src = img.getAttribute('data-src');
                if (src) {
                    img.src = src;
                    img.removeAttribute('data-src');
                    img.classList.add('loaded');
                }
                observer.unobserve(img);
            }
        });
    }, {
        rootMargin: '50px 0px',
        threshold: 0.01
    });

    window.observeImage = function(img) {
        if (img && img.hasAttribute('data-src')) {
            imageObserver.observe(img);
        }
    };
}

// 获取图片的压缩预览 URL（使用 Cloudinary 优化）
function getOptimizedUrl(url, width = 400) {
    if (!url) return url;
    // 如果是 Cloudinary 图片，添加优化参数
    if (url.includes('cloudinary.com')) {
        // 在 URL 中插入优化参数
        return url.replace('/upload/', `/upload/w_${width},q_auto,f_webp,c_limit/`);
    }
    return url;
}

// 渲染表情包
function renderMemes() {
    const grid = document.getElementById('memeGrid');
    if (!grid) return;

    let filtered = [...memesData];

    // 分类筛选
    if (currentCategory !== 'all') {
        if (currentCategory === 'static') {
            filtered = filtered.filter(m => !m.isGif);
        } else if (currentCategory === 'gif') {
            filtered = filtered.filter(m => m.isGif);
        } else if (currentCategory === 'featured' || currentCategory === 'recommended') {
            filtered = filtered.filter(m => {
                const tags = m.tags || [];
                return tags.includes(currentCategory);
            });
        } else {
            filtered = filtered.filter(m => {
                const cats = m.category || [];
                return cats.includes(currentCategory);
            });
        }
    }

    // 搜索筛选
    if (searchQuery) {
        filtered = filtered.filter(m => m.title && m.title.includes(searchQuery));
    }

    // 排序
    if (currentSort === 'newest') {
        filtered.sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));
    } else if (currentSort === 'hottest') {
        filtered.sort((a, b) => (b.hot || 0) - (a.hot || 0));
    } else if (currentSort === 'random') {
        filtered.sort(() => Math.random() - 0.5);
    }

    // 更新计数
    const resultCount = document.getElementById('resultCount');
    if (resultCount) resultCount.textContent = filtered.length;

    // 渲染
    if (filtered.length === 0) {
        grid.innerHTML = `
            <div class="empty-state" style="grid-column: 1/-1;">
                <div class="icon">📝</div>
                <p>还没有菲比表情包</p>
                <p>点击"添加新菲比"来添加第一个表情包吧~</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = filtered.map(meme => {
        const optimizedUrl = getOptimizedUrl(meme.url, 400);
        const fullUrl = meme.url;
        const safeTitle = escapeHtml(meme.title || '未命名');
        return `
        <div class="meme-card" data-id="${meme.firebaseId || meme.id}">
            <img data-src="${optimizedUrl}" data-full="${fullUrl}" alt="${safeTitle}" class="meme-image ${meme.isGif ? 'gif-image' : ''} lazy" loading="lazy"
                onerror="this.src='https://via.placeholder.com/300x300/B794F6/FFFFFF?text=${encodeURIComponent(meme.title || '菲比')}'"
                onclick="openLightbox('${fullUrl}')"
                onload="this.classList.add('loaded')">
            <div class="meme-info">
                <div class="meme-title">${safeTitle}</div>
                ${renderMemeTags(meme)}
                <div class="meme-meta">
                    <div class="meme-stats">
                        <span class="meme-stat">
                            <span class="stat-label">热度</span>
                            <span class="stat-value">${meme.hot || 0}</span>
                        </span>
                        <span class="meme-stat">
                            <span class="stat-label">下载</span>
                            <span class="stat-value">${formatNumber(meme.downloads || 0)}</span>
                        </span>
                    </div>
                    <span>${meme.date || ''}</span>
                </div>
                <div class="meme-actions">
                    <div class="meme-type ${meme.isGif ? 'gif' : 'static'}">
                        ${meme.isGif ? '动态图片' : '静态图片'}
                    </div>
                    <button class="download-btn" onclick="event.stopPropagation(); downloadMeme('${meme.firebaseId || meme.id}')" title="下载">
                        下载
                    </button>
                </div>
                ${isAdmin ? renderAdminActions(meme) : ''}
            </div>
        </div>
    `}).join('');

    // 初始化懒加载观察
    document.querySelectorAll('.meme-image.lazy').forEach(img => {
        if (window.observeImage) window.observeImage(img);
    });
}

// 渲染表情包的标签
function renderMemeTags(meme) {
    const tags = meme.tags || [];
    const category = meme.category || [];
    const isAi = category.includes('ai');
    const isCute = category.includes('cute');

    const displayTags = [...new Set(tags)].filter(tag => tag && tag !== 'static' && tag !== 'gif' && tag !== 'ai' && tag !== 'cute');
    if (displayTags.length === 0 && !isAi && !isCute) return '';

    return `
        <div class="meme-tags">
            ${isCute ? `<span class="meme-tag cute">超可爱</span>` : ''}
            ${isAi ? `<span class="meme-tag ai">AI创作</span>` : ''}
            ${displayTags.map(tag => `
                <span class="meme-tag ${escapeHtml(tag)}">${escapeHtml(TAG_LABELS[tag] || tag)}</span>
            `).join('')}
        </div>
    `;
}

// 渲染管理员操作按钮
function renderAdminActions(meme) {
    const tags = meme.tags || [];
    const category = meme.category || [];
    const isFeatured = tags.includes('featured');
    const isRecommended = tags.includes('recommended');
    const isAi = category.includes('ai');

    return `
        <div class="admin-actions">
            <button class="admin-btn edit" onclick="event.stopPropagation(); editMemeName('${meme.firebaseId || meme.id}')">改名</button>
            <button class="admin-btn tag" onclick="event.stopPropagation(); toggleTag('${meme.firebaseId || meme.id}', 'featured')">
                ${isFeatured ? '移除精选' : '设为精选'}
            </button>
            <button class="admin-btn tag-purple" onclick="event.stopPropagation(); toggleTag('${meme.firebaseId || meme.id}', 'recommended')">
                ${isRecommended ? '移除推荐' : '站长推荐'}
            </button>
            <button class="admin-btn tag-ai" onclick="event.stopPropagation(); toggleAiCategory('${meme.firebaseId || meme.id}')">
                ${isAi ? '移除AI创作' : 'AI创作'}
            </button>
            <button class="admin-btn delete" onclick="event.stopPropagation(); deleteMeme('${meme.firebaseId || meme.id}')">删除</button>
        </div>
    `;
}

// 更新热门列表
function updateHotList() {
    const hotList = document.getElementById('hotList');
    if (!hotList) return;

    const sorted = [...memesData].sort((a, b) => (b.hot || 0) - (a.hot || 0)).slice(0, 6);

    if (sorted.length === 0) {
        hotList.innerHTML = `
            <div class="hot-item"><div class="hot-rank top">1</div><span class="hot-text">等待添加...</span></div>
            <div class="hot-item"><div class="hot-rank top">2</div><span class="hot-text">等待添加...</span></div>
            <div class="hot-item"><div class="hot-rank top">3</div><span class="hot-text">等待添加...</span></div>
        `;
        return;
    }

    hotList.innerHTML = sorted.map((meme, index) => {
        const safeTitle = escapeHtml(meme.title || '未命名');
        const jsTitle = (meme.title || '未命名').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        return `
        <div class="hot-item" onclick="searchByTitle('${jsTitle}')">
            <div class="hot-rank ${index < 3 ? 'top' : ''}">${index + 1}</div>
            <span class="hot-text">${safeTitle}</span>
        </div>
    `;
    }).join('');
}

// 搜索标题
function searchByTitle(title) {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.value = title;
        searchQuery = title;
        renderMemes();
    }
}

// 下载表情包 - 使用 fetch + blob 实现真正的下载
async function downloadMeme(id) {
    const meme = memesData.find(m => (m.firebaseId || m.id) == id);
    if (!meme) return;

    // 增加下载量
    meme.downloads = (meme.downloads || 0) + 1;
    meme.hot = Math.min(100, (meme.hot || 0) + 1);

    // 同步到 Firebase
    if (firebaseEnabled && meme.firebaseId) {
        try {
            await db.collection('memes').doc(meme.firebaseId).update({
                downloads: meme.downloads,
                hot: meme.hot
            });
        } catch (e) {
            console.error('更新下载量失败:', e);
        }
    }

    renderMemes();
    updateHotList();

    // 执行下载 - 使用 fetch + blob
    try {
        showToast('正在下载...');
        const response = await fetch(meme.url);
        if (!response.ok) throw new Error('下载失败');
        
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        
        const extension = meme.isGif ? 'gif' : 'jpg';
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `${meme.title || '菲比'}.${extension}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // 清理 blob URL
        setTimeout(() => window.URL.revokeObjectURL(blobUrl), 1000);
        
        showToast('下载成功！');
    } catch (e) {
        console.error('下载失败:', e);
        // 降级方案：直接打开图片
        const link = document.createElement('a');
        link.href = meme.url;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

// 格式化数字
function formatNumber(num) {
    if (num >= 10000) return (num / 10000).toFixed(1) + 'w';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return num.toString();
}

// 分类筛选
function filterCategory(category, btn) {
    currentCategory = category;
    document.querySelectorAll('.category-tabs .tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderMemes();
}

// 排序
function sortMemes(sort, btn) {
    currentSort = sort;
    document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderMemes();
}

// 搜索
function handleSearch() {
    searchQuery = document.getElementById('searchInput').value;
    renderMemes();
}

// 切换导航标签
function switchTab(tab, el) {
    document.querySelectorAll('.nav-menu a').forEach(a => a.classList.remove('active'));
    if (el) el.classList.add('active');

    // 重置分类按钮
    document.querySelectorAll('.category-tabs .tab-btn').forEach(b => b.classList.remove('active'));

    if (tab === 'featured') {
        currentCategory = 'featured';
        currentSort = 'hottest';
    } else if (tab === 'all') {
        currentCategory = 'all';
        currentSort = 'newest';
    } else if (tab === 'recommended') {
        currentCategory = 'recommended';
        currentSort = 'hottest';
    }

    // 高亮对应的分类按钮
    const categoryBtns = document.querySelectorAll('.category-tabs .tab-btn');
    categoryBtns.forEach(btn => {
        const onclick = btn.getAttribute('onclick');
        if (onclick && onclick.includes(`'${currentCategory}'`)) {
            btn.classList.add('active');
        }
    });

    document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
    const sortBtn = document.querySelector(`button[onclick="sortMemes('${currentSort}', this)"]`);
    if (sortBtn) sortBtn.classList.add('active');

    renderMemes();
}

// 按角色筛选
function filterByCharacter(name) {
    searchQuery = '';
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';
    renderMemes();
}

// 图片查看器
function openLightbox(url) {
    const lightbox = document.getElementById('lightbox');
    const img = document.getElementById('lightboxImg');
    img.src = url;
    lightbox.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeLightbox() {
    const lightbox = document.getElementById('lightbox');
    lightbox.classList.remove('active');
    document.body.style.overflow = '';
}

// 上传模态框
function initUploadModal() {
    const fileInput = document.getElementById('uploadFile');
    const fileUpload = document.getElementById('fileUploadContainer');

    if (fileUpload && fileInput) {
        // 点击上传区域触发文件选择（兼容移动端，input 本身已隐藏）
        fileUpload.addEventListener('click', (e) => {
            if (e.target === fileInput) return;
            fileInput.click();
        });
    }
}

// 显示上传模态框
function showAddModal() {
    const modal = document.getElementById('uploadModal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

// 关闭上传模态框
function closeUploadModal() {
    const modal = document.getElementById('uploadModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }

    const form = document.getElementById('uploadForm');
    const preview = document.getElementById('previewImage');
    if (form) form.reset();
    if (preview) {
        preview.src = '';
        preview.style.display = 'none';
    }
}

// 将文件转换为 WebP
async function convertToWebP(file, quality = 0.85) {
    // 如果是 GIF，保持原格式
    if (file.type === 'image/gif') {
        return file;
    }

    return new Promise((resolve, reject) => {
        const img = new Image();
        const reader = new FileReader();
        
        reader.onload = (e) => {
            img.src = e.target.result;
        };
        
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            
            canvas.toBlob((blob) => {
                if (blob) {
                    // 创建新的 File 对象
                    const webpFile = new File([blob], file.name.replace(/\.[^.]+$/, '.webp'), {
                        type: 'image/webp',
                        lastModified: Date.now()
                    });
                    resolve(webpFile);
                } else {
                    resolve(file); // 转换失败，返回原文件
                }
            }, 'image/webp', quality);
        };
        
        img.onerror = () => resolve(file); // 转换失败，返回原文件
        reader.readAsDataURL(file);
    });
}

// 压缩图片
async function compressImageFile(file, maxWidth = 1200, quality = 0.85) {
    // 如果是 GIF，保持原格式
    if (file.type === 'image/gif') {
        return file;
    }

    return new Promise((resolve, reject) => {
        const img = new Image();
        const reader = new FileReader();
        
        reader.onload = (e) => {
            img.src = e.target.result;
        };
        
        img.onload = () => {
            let width = img.width;
            let height = img.height;
            
            if (width > maxWidth) {
                height = Math.round(height * maxWidth / width);
                width = maxWidth;
            }
            
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);
            
            canvas.toBlob((blob) => {
                if (blob) {
                    const compressedFile = new File([blob], file.name, {
                        type: file.type,
                        lastModified: Date.now()
                    });
                    resolve(compressedFile);
                } else {
                    resolve(file);
                }
            }, file.type, quality);
        };
        
        img.onerror = () => resolve(file);
        reader.readAsDataURL(file);
    });
}

// 用户选择上传文件后触发：计算感知哈希并提示相似图片
async function onUploadFileSelected(file) {
    currentUploadHash = null;
    const notice = document.getElementById('dedupNotice');
    if (notice) {
        notice.style.display = 'none';
        notice.innerHTML = '';
        notice.className = 'dedup-notice';
    }

    if (!file || !file.type.startsWith('image/')) return;

    try {
        showToast('正在检测是否有重复图片...');
        const hash = await computeImageHash(file);
        currentUploadHash = hash;

        // 与已有图片比对（只比较有 hash 的）
        const candidates = findDuplicateCandidates(hash, memesData);
        const similar = findSimilarImages(hash, memesData).filter(r => r.distance > DedupConfig.blockThreshold);

        if (!notice) return;

        if (candidates.length > 0) {
            notice.className = 'dedup-notice danger';
            notice.innerHTML = `
                <div class="dedup-title">⚠️ 发现高度相似图片</div>
                <div>这张图片可能与以下内容重复，建议先搜索查看：</div>
                <div style="margin-top:6px;">
                    ${candidates.slice(0, 3).map(r => `
                        <a onclick="searchByTitle('${escapeHtml(r.meme.title || '').replace(/'/g, "\\'")}')">${escapeHtml(r.meme.title || '未命名')}</a>
                        <span style="color:#999;font-size:11px;">(相似度 ${(r.similarity * 100).toFixed(0)}%)</span>
                    `).join('<br>')}
                </div>
            `;
            notice.style.display = 'block';
        } else if (similar.length > 0) {
            notice.className = 'dedup-notice warning';
            notice.innerHTML = `
                <div class="dedup-title">💡 发现相似图片</div>
                <div>以下内容可能与你上传的图片相似：</div>
                <div style="margin-top:6px;">
                    ${similar.slice(0, 3).map(r => `
                        <a onclick="searchByTitle('${escapeHtml(r.meme.title || '').replace(/'/g, "\\'")}')">${escapeHtml(r.meme.title || '未命名')}</a>
                        <span style="color:#999;font-size:11px;">(相似度 ${(r.similarity * 100).toFixed(0)}%)</span>
                    `).join('<br>')}
                </div>
            `;
            notice.style.display = 'block';
        }
    } catch (e) {
        console.warn('去重检测失败:', e);
    }
}

// 处理上传 - 上传到 Firebase 待审核
async function handleUpload(event) {
    event.preventDefault();

    if (!firebaseEnabled) {
        alert('Firebase 未配置，无法上传。请先配置 Firebase。');
        return false;
    }

    const fileInput = document.getElementById('uploadFile');
    const nameInput = document.getElementById('phoebeName');

    const file = fileInput.files[0];
    const name = nameInput.value.trim();

    // 读取用户选择的多选分类
    const checkedCategories = Array.from(document.querySelectorAll('input[name="phoebeCategory"]:checked')).map(cb => cb.value);

    if (!file) {
        alert('请选择一张菲比图片！');
        return false;
    }

    // 安全校验
    const fileError = validateFile(file);
    if (fileError) {
        alert(fileError);
        return false;
    }

    const limitError = checkUploadLimit(1);
    if (limitError) {
        alert(limitError);
        return false;
    }

    if (!name) {
        alert('请给菲比起一个可爱的名字！');
        return false;
    }

    if (name.length > UPLOAD_CONFIG.maxTitleLength) {
        alert(`名字太长了，最多 ${UPLOAD_CONFIG.maxTitleLength} 个字`);
        return false;
    }

    const submitBtn = document.querySelector('.submit-btn');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = '上传中...';
    }

    try {
        // 1. 判断是否为 GIF
        const isGif = file.type === 'image/gif';

        // 2. 根据文件类型自动加上 static/gif
        const autoType = isGif ? 'gif' : 'static';
        const category = [...new Set([autoType, ...checkedCategories])];

        // 3. 压缩图片
        showToast('正在压缩图片...');
        let processedFile = await compressImageFile(file, 1200, 0.85);

        // 4. 转换为 WebP（GIF 除外）
        if (!isGif) {
            showToast('正在转换为 WebP...');
            processedFile = await convertToWebP(processedFile, 0.85);
        }

        // 5. 上传图片到 Cloudinary
        showToast('正在上传图片到云端...');
        const imageUrl = await uploadToCloudinary(processedFile);

        // 6. 保存图片 URL 到 Firestore pending 集合
        const pendingData = {
            title: name,
            url: imageUrl,
            category: category,
            isGif: isGif,
            date: new Date().toISOString().split('T')[0],
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            status: 'pending'
        };
        if (currentUploadHash) {
            pendingData.hash = currentUploadHash;
        }
        await db.collection('pending').add(pendingData);

        // 记录上传成功
        recordUploadAttempt(1);
        currentUploadHash = null;

        closeUploadModal();
        showToast(`「${name}」已提交审核，请耐心等待~`);

        // 如果管理员面板打开，更新显示
        if (isAdmin) {
            await refreshPendingList();
        }
    } catch (e) {
        console.error('上传失败:', e);
        let msg = '上传失败: ' + (e.message || '未知错误');
        if (e.message && /permission|permissions|Missing or insufficient permissions/i.test(e.message)) {
            msg = '上传失败：Firestore 权限不足。\n\n' +
                  '请按以下步骤检查：\n' +
                  '1. 打开 Firebase 控制台 → Firestore Database → 规则\n' +
                  '2. 把规则替换成 firestore.rules 文件里的内容\n' +
                  '3. 点击「发布」并等待 1-2 分钟生效\n\n' +
                  '注意：pending 集合的 create 必须设置为 if true，否则匿名用户无法上传。';
        }
        alert(msg);
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = '发布菲比';
        }
    }

    return false;
}

// 刷新待审核列表
async function refreshPendingList() {
    await loadPendingData();
    renderAdminPanel();
}

// 管理员面板
function initAdminPanel() {
    const adminToggle = document.getElementById('adminToggle');
    if (adminToggle) adminToggle.style.display = 'none';

    const phoebeAvatar = document.getElementById('phoebeAvatar');
    if (phoebeAvatar) {
        let clickCount = 0;
        let clickTimer = null;

        phoebeAvatar.addEventListener('click', () => {
            clickCount++;
            if (clickCount === 1) {
                clickTimer = setTimeout(() => {
                    clickCount = 0;
                }, 2000);
            }
            if (clickCount >= 3) {
                clearTimeout(clickTimer);
                clickCount = 0;
                toggleAdmin();
            }
        });
    }
}

function toggleAdmin() {
    if (!isAdmin) {
        openLoginModal();
    } else {
        auth.signOut().then(() => {
            isAdmin = false;
            currentUser = null;
            const panel = document.getElementById('adminPanel');
            if (panel) panel.classList.remove('active');
            showToast('已退出管理员模式');
            renderMemes();
        }).catch(e => {
            console.error('退出失败:', e);
            showToast('退出失败');
        });
    }
}

function openLoginModal() {
    const modal = document.getElementById('loginModal');
    const errorDiv = document.getElementById('loginError');
    if (modal) {
        modal.classList.add('show');
        document.body.style.overflow = 'hidden';
    }
    if (errorDiv) errorDiv.textContent = '';
}

function closeLoginModal() {
    const modal = document.getElementById('loginModal');
    if (modal) {
        modal.classList.remove('show');
        document.body.style.overflow = '';
    }
    const form = document.getElementById('loginForm');
    if (form) form.reset();
    const errorDiv = document.getElementById('loginError');
    if (errorDiv) errorDiv.textContent = '';
}

async function handleLogin(event) {
    event.preventDefault();
    if (!auth) {
        showToast('Firebase 认证未初始化');
        return false;
    }

    const emailInput = document.getElementById('adminEmail');
    const passwordInput = document.getElementById('adminPassword');
    const errorDiv = document.getElementById('loginError');

    const email = emailInput ? emailInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value : '';

    try {
        errorDiv.textContent = '';
        await auth.signInWithEmailAndPassword(email, password);
        showToast('管理员登录成功！');
    } catch (e) {
        console.error('登录失败:', e);
        let msg = '登录失败';
        if (e.code === 'auth/user-not-found' || e.code === 'auth/wrong-password') {
            msg = '邮箱或密码错误';
        } else if (e.code === 'auth/invalid-email') {
            msg = '邮箱格式不正确';
        } else if (e.message) {
            msg = e.message;
        }
        if (errorDiv) errorDiv.textContent = msg;
    }

    return false;
}

function renderAdminPanel() {
    const panel = document.getElementById('adminPanel');
    if (!panel) return;

    panel.classList.add('active');

    if (pendingData.length === 0) {
        panel.innerHTML = `
            <h3>审核面板</h3>
            <p style="text-align: center; color: #999; padding: 20px;">暂无待审核内容</p>
            <button class="review-btn approve" onclick="showBatchUploadModal()" style="width: 100%; margin-top: 10px;">批量上传</button>
            <button class="review-btn approve" onclick="showBulkManageModal()" style="width: 100%; margin-top: 10px;">已发布管理</button>
            <button class="review-btn approve" onclick="batchComputeMissingHashes()" style="width: 100%; margin-top: 10px;">补算图片指纹</button>
            <button class="review-btn approve" onclick="refreshAllData()" style="width: 100%; margin-top: 10px;">刷新数据</button>
        `;
        return;
    }

    panel.innerHTML = `
        <h3>审核面板 (${pendingData.length} 条待审核)</h3>
        <div class="batch-actions">
            <button class="review-btn approve" onclick="selectAllPending()">全选</button>
            <button class="review-btn approve" onclick="batchApprove()">一键同意</button>
            <button class="review-btn reject" onclick="batchReject()">一键拒绝</button>
        </div>
        ${pendingData.map((item, index) => {
            const currentCats = Array.isArray(item.category) ? item.category : ['cute'];
            const isChecked = (value) => currentCats.includes(value) ? 'checked' : '';
            return `
            <div class="review-item">
                <input type="checkbox" class="review-checkbox" data-id="${item.firebaseId}" data-index="${index}" onchange="togglePendingSelection('${item.firebaseId}')">
                <img src="${getOptimizedUrl(item.url, 100)}" alt="${escapeHtml(item.title)}" loading="lazy">
                <div class="review-item-info">
                    <div class="review-item-title">${escapeHtml(item.title) || '未命名'}</div>
                    <div class="review-item-date">${item.date || ''} | ${item.isGif ? '动态' : '静态'}</div>
                    <div class="review-category-checkboxes" style="margin-top:6px;display:flex;flex-wrap:wrap;gap:6px;">
                        <label style="font-size:11px;display:flex;align-items:center;gap:3px;cursor:pointer;"><input type="checkbox" onchange="updatePendingCategory(${index}, 'cute', this.checked)" ${isChecked('cute')}><span>超可爱</span></label>
                        <label style="font-size:11px;display:flex;align-items:center;gap:3px;cursor:pointer;"><input type="checkbox" onchange="updatePendingCategory(${index}, 'ai', this.checked)" ${isChecked('ai')}><span>AI创作</span></label>
                        <label style="font-size:11px;display:flex;align-items:center;gap:3px;cursor:pointer;"><input type="checkbox" onchange="updatePendingCategory(${index}, 'static', this.checked)" ${isChecked('static')}><span>静态图</span></label>
                        <label style="font-size:11px;display:flex;align-items:center;gap:3px;cursor:pointer;"><input type="checkbox" onchange="updatePendingCategory(${index}, 'gif', this.checked)" ${isChecked('gif')}><span>动态图</span></label>
                    </div>
                </div>
                <div class="review-actions">
                    <button class="review-btn approve" onclick="approveMeme('${item.firebaseId}', ${index})">通过</button>
                    <button class="review-btn reject" onclick="rejectMeme('${item.firebaseId}', ${index})">拒绝</button>
                </div>
            </div>
            `;
        }).join('')}
        <button class="review-btn approve" onclick="showBatchUploadModal()" style="width: 100%; margin-top: 10px;">批量上传</button>
        <button class="review-btn approve" onclick="showBulkManageModal()" style="width: 100%; margin-top: 10px;">已发布管理</button>
        <button class="review-btn approve" onclick="batchComputeMissingHashes()" style="width: 100%; margin-top: 10px;">补算图片指纹</button>
        <button class="review-btn approve" onclick="refreshAllData()" style="width: 100%; margin-top: 15px;">刷新全部数据</button>
    `;
}

// 修改待审核项分类（支持多选）
function updatePendingCategory(index, categoryValue, checked) {
    const item = pendingData[index];
    if (!item) return;

    const currentCats = Array.isArray(item.category) ? [...item.category] : [];
    if (checked) {
        if (!currentCats.includes(categoryValue)) {
            currentCats.push(categoryValue);
        }
    } else {
        const idx = currentCats.indexOf(categoryValue);
        if (idx > -1) currentCats.splice(idx, 1);
    }

    // 至少保留一个分类
    if (currentCats.length === 0) {
        const autoType = item.isGif ? 'gif' : 'static';
        currentCats.push(autoType);
    }

    item.category = currentCats;
}

// 切换 AI创作 分类
async function toggleAiCategory(id) {
    if (!isAdmin) return;

    const meme = memesData.find(m => (m.firebaseId || m.id) == id);
    if (!meme) return;

    const category = meme.category || [];
    const hasAi = category.includes('ai');
    const newCategory = hasAi
        ? category.filter(c => c !== 'ai')
        : [...category, 'ai'];

    if (firebaseEnabled && meme.firebaseId) {
        try {
            await db.collection('memes').doc(meme.firebaseId).update({
                category: newCategory
            });
            showToast(hasAi ? '已移除 AI创作 分类' : '已设为 AI创作');
        } catch (e) {
            console.error('修改分类失败:', e);
            alert('修改分类失败: ' + e.message);
            return;
        }
    }

    meme.category = newCategory;
    renderMemes();
}

// 批量审核功能
function selectAllPending() {
    const checkboxes = document.querySelectorAll('.review-checkbox');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    
    checkboxes.forEach(cb => {
        cb.checked = !allChecked;
        const id = cb.getAttribute('data-id');
        if (!allChecked) {
            selectedPendingIds.add(id);
        } else {
            selectedPendingIds.delete(id);
        }
    });
}

function togglePendingSelection(id) {
    if (selectedPendingIds.has(id)) {
        selectedPendingIds.delete(id);
    } else {
        selectedPendingIds.add(id);
    }
}

async function batchApprove() {
    if (!firebaseEnabled || !isAdmin) return;
    if (selectedPendingIds.size === 0) {
        showToast('请先选择要审核的项目');
        return;
    }

    if (!confirm(`确定要批量通过 ${selectedPendingIds.size} 条内容吗？`)) return;

    showToast(`正在批量通过 ${selectedPendingIds.size} 条内容...`);
    let successCount = 0;

    for (const id of selectedPendingIds) {
        const meme = pendingData.find(p => p.firebaseId === id);
        if (!meme) continue;

        try {
            const newMemeData = {
                title: meme.title,
                url: meme.url,
                category: meme.category || ['cute'],
                isGif: meme.isGif || false,
                date: meme.date,
                views: 0,
                downloads: 0,
                hot: 0,
                tags: [],
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            if (meme.hash) newMemeData.hash = meme.hash;

            await db.collection('memes').add(newMemeData);
            await db.collection('pending').doc(id).delete();
            successCount++;
        } catch (e) {
            console.error(`审核通过失败 (${id}):`, e);
        }
    }

    showToast(`成功通过 ${successCount} 条内容！`);
    // 从 pendingData 中移除已审核的项目
    pendingData = pendingData.filter(p => !selectedPendingIds.has(p.firebaseId));
    selectedPendingIds.clear();
    await loadData();
    await refreshPendingList();
}

async function batchReject() {
    if (!firebaseEnabled || !isAdmin) return;
    if (selectedPendingIds.size === 0) {
        showToast('请先选择要拒绝的项目');
        return;
    }

    if (!confirm(`确定要批量拒绝 ${selectedPendingIds.size} 条内容吗？`)) return;

    showToast(`正在批量拒绝 ${selectedPendingIds.size} 条内容...`);
    let successCount = 0;

    for (const id of selectedPendingIds) {
        try {
            await db.collection('pending').doc(id).delete();
            successCount++;
        } catch (e) {
            console.error(`审核拒绝失败 (${id}):`, e);
        }
    }

    showToast(`成功拒绝 ${successCount} 条内容`);
    // 从 pendingData 中移除已拒绝的项目
    pendingData = pendingData.filter(p => !selectedPendingIds.has(p.firebaseId));
    selectedPendingIds.clear();
    await refreshPendingList();
}

// 管理员批量补算旧图指纹
async function batchComputeMissingHashes() {
    if (!firebaseEnabled || !isAdmin) {
        showToast('请先登录管理员账号');
        return;
    }

    // 只处理已发布且没有 hash 的图片
    const missing = memesData.filter(m => m.url && !m.hash);
    if (missing.length === 0) {
        showToast('所有已发布图片都已有指纹');
        return;
    }

    if (!confirm(`共有 ${missing.length} 张旧图缺少指纹，现在开始补算吗？\n这会逐张下载图片并在浏览器本地计算，可能需要一些时间。`)) {
        return;
    }

    showToast(`开始补算 ${missing.length} 张图片指纹...`);
    let updatedCount = 0;
    let failedCount = 0;

    try {
        const results = await batchComputeHashes(missing, (current, total) => {
            showToast(`正在计算指纹 ${current}/${total}...`);
        });

        // 写回 Firestore
        for (const item of results) {
            if (!item.hash) continue;
            try {
                await db.collection('memes').doc(item.id).update({ hash: item.hash });
                updatedCount++;
            } catch (e) {
                console.error(`保存指纹失败 (${item.id}):`, e);
                failedCount++;
            }
        }
    } catch (e) {
        console.error('批量补算指纹失败:', e);
        showToast('补算过程出错，请查看控制台');
        return;
    }

    showToast(`补算完成：成功 ${updatedCount} 张，失败 ${failedCount} 张`);
    await loadData();
    renderMemes();
}

// 批量上传功能
function initBatchUpload() {
    const batchUploadArea = document.getElementById('batchUploadArea');
    const batchUploadFile = document.getElementById('batchUploadFile');

    if (batchUploadArea && batchUploadFile) {
        batchUploadArea.addEventListener('click', () => batchUploadFile.click());

        batchUploadFile.addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            handleBatchFiles(files);
        });
    }
}

function showBatchUploadModal() {
    if (!isAdmin) {
        showToast('请先登录管理员账号');
        return;
    }
    const modal = document.getElementById('batchUploadModal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeBatchUploadModal() {
    const modal = document.getElementById('batchUploadModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
    batchFiles = [];
    const list = document.getElementById('batchUploadList');
    if (list) list.innerHTML = '';
    const checkboxes = document.querySelectorAll('input[name="batchCategory"]');
    checkboxes.forEach(cb => cb.checked = false);
}

function handleBatchFiles(files) {
    // 过滤允许的格式并限制数量
    const validFiles = files.filter(file => UPLOAD_CONFIG.allowedTypes.includes(file.type));
    if (validFiles.length < files.length) {
        showToast('已过滤掉不支持的文件格式，仅保留 JPG/PNG/GIF/WebP');
    }
    batchFiles = validFiles.slice(0, UPLOAD_CONFIG.maxBatchCount);
    if (files.length > UPLOAD_CONFIG.maxBatchCount) {
        showToast(`单次最多上传 ${UPLOAD_CONFIG.maxBatchCount} 张，已自动截取前 ${UPLOAD_CONFIG.maxBatchCount} 张`);
    }
    const list = document.getElementById('batchUploadList');
    if (!list) return;

    list.innerHTML = batchFiles.map((file, index) => {
        const fileName = escapeHtml(file.name.replace(/\.[^.]+$/, ''));
        const objectUrl = URL.createObjectURL(file);
        return `
            <div class="batch-upload-item">
                <img src="${objectUrl}" alt="${fileName}">
                <input type="text" value="${fileName}" data-index="${index}" placeholder="图片名称">
            </div>
        `;
    }).join('');
}

async function handleBatchUpload() {
    if (!firebaseEnabled) {
        alert('Firebase 未配置，无法上传。');
        return;
    }

    if (batchFiles.length === 0) {
        alert('请选择图片文件！');
        return;
    }

    // 批量大小限制
    if (batchFiles.length > UPLOAD_CONFIG.maxBatchCount) {
        alert(`单次最多上传 ${UPLOAD_CONFIG.maxBatchCount} 张`);
        return;
    }

    // 校验每个文件
    for (const file of batchFiles) {
        const fileError = validateFile(file);
        if (fileError) {
            alert(`[${file.name}] ${fileError}`);
            return;
        }
    }

    const limitError = checkUploadLimit(batchFiles.length);
    if (limitError) {
        alert(limitError);
        return;
    }

    // 读取用户选择的多选分类
    const checkedCategories = Array.from(document.querySelectorAll('input[name="batchCategory"]:checked')).map(cb => cb.value);
    const nameInputs = document.querySelectorAll('#batchUploadList input');

    const submitBtn = document.querySelector('#batchUploadModal .submit-btn');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = '上传中...';
    }

    let successCount = 0;

    for (let i = 0; i < batchFiles.length; i++) {
        const file = batchFiles[i];
        const nameInput = nameInputs[i];
        let name = nameInput ? nameInput.value.trim() : file.name.replace(/\.[^.]+$/, '');

        if (!name) continue;
        if (name.length > UPLOAD_CONFIG.maxTitleLength) {
            name = name.slice(0, UPLOAD_CONFIG.maxTitleLength);
        }

        try {
            const isGif = file.type === 'image/gif';

            // 根据文件类型自动加上 static/gif
            const autoType = isGif ? 'gif' : 'static';
            const category = [...new Set([autoType, ...checkedCategories])];

            // 计算感知哈希
            let fileHash = null;
            try {
                fileHash = await computeImageHash(file);
            } catch (e) {
                console.warn('批量上传哈希计算失败:', file.name, e);
            }

            // 压缩
            let processedFile = await compressImageFile(file, 1200, 0.85);

            // 转换为 WebP（GIF 除外）
            if (!isGif) {
                processedFile = await convertToWebP(processedFile, 0.85);
            }

            // 上传
            const imageUrl = await uploadToCloudinary(processedFile);

            // 保存到 pending
            const pendingItem = {
                title: name,
                url: imageUrl,
                category: category,
                isGif: isGif,
                date: new Date().toISOString().split('T')[0],
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                status: 'pending'
            };
            if (fileHash) pendingItem.hash = fileHash;
            await db.collection('pending').add(pendingItem);

            successCount++;
        } catch (e) {
            console.error(`批量上传失败 (${file.name}):`, e);
        }
    }

    // 记录实际成功上传数
    recordUploadAttempt(successCount);

    closeBatchUploadModal();
    showToast(`成功上传 ${successCount}/${batchFiles.length} 个文件，等待审核~`);

    if (isAdmin) {
        await refreshPendingList();
    }

    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = '批量发布';
    }
}

// 刷新公开数据和待审核数据
async function refreshAllData() {
    await loadData();
    await refreshPendingList();
}

// 审核通过
async function approveMeme(firebaseId, index) {
    if (!firebaseEnabled || !isAdmin) return;

    const meme = pendingData[index];
    if (!meme) return;

    try {
            // 1. 添加到 memes 集合
            const newMemeData = {
                title: meme.title,
                url: meme.url,
                category: meme.category || ['cute'],
                isGif: meme.isGif || false,
                date: meme.date,
                views: 0,
                downloads: 0,
                hot: 0,
                tags: [],
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            if (meme.hash) newMemeData.hash = meme.hash;

            await db.collection('memes').add(newMemeData);

            // 2. 从 pending 删除
            await db.collection('pending').doc(firebaseId).delete();

        // 3. 更新本地数据
        pendingData.splice(index, 1);
        showToast(`「${meme.title}」审核通过！`);

        // 4. 重新加载数据
        await loadData();
        await refreshPendingList();
    } catch (e) {
        console.error('审核通过失败:', e);
        alert('审核失败: ' + e.message);
    }
}

// 审核拒绝
async function rejectMeme(firebaseId, index) {
    if (!firebaseEnabled || !isAdmin) return;

    const meme = pendingData[index];
    if (!meme) return;

    try {
        // 从 pending 删除
        await db.collection('pending').doc(firebaseId).delete();

        pendingData.splice(index, 1);
        showToast(`「${meme.title}」已拒绝`);
        await refreshPendingList();
    } catch (e) {
        console.error('审核拒绝失败:', e);
        alert('拒绝失败: ' + e.message);
    }
}

// 删除已发布的表情包
async function deleteMeme(id) {
    if (!isAdmin) return;

    const meme = memesData.find(m => (m.firebaseId || m.id) == id);
    if (!meme) return;

    if (!confirm(`确定要删除「${meme.title || '未命名'}」吗？`)) return;

    if (firebaseEnabled && meme.firebaseId) {
        try {
            await db.collection('memes').doc(meme.firebaseId).delete();
            showToast(`「${meme.title || '未命名'}」已删除`);
        } catch (e) {
            console.error('删除失败:', e);
            alert('删除失败: ' + e.message);
            return;
        }
    }

    // 从本地数据中移除
    memesData = memesData.filter(m => (m.firebaseId || m.id) != id);
    renderMemes();
    updateHotList();
    renderAdminPanel();
}

// 修改已发布表情包的名称
async function editMemeName(id) {
    if (!isAdmin) return;

    const meme = memesData.find(m => (m.firebaseId || m.id) == id);
    if (!meme) return;

    const newName = prompt('请输入新的名字：', meme.title || '');
    if (!newName || newName.trim() === '') return;
    if (newName.trim() === meme.title) return;

    const finalName = newName.trim();

    if (firebaseEnabled && meme.firebaseId) {
        try {
            await db.collection('memes').doc(meme.firebaseId).update({
                title: finalName
            });
            showToast('修改成功！');
        } catch (e) {
            console.error('改名失败:', e);
            alert('改名失败: ' + e.message);
            return;
        }
    }

    meme.title = finalName;
    renderMemes();
    updateHotList();
}

// 切换表情包的精选/推荐标签
async function toggleTag(id, tagName) {
    if (!isAdmin) return;

    const meme = memesData.find(m => (m.firebaseId || m.id) == id);
    if (!meme) return;

    const tags = meme.tags || [];
    const hasTag = tags.includes(tagName);

    let newTags;
    if (hasTag) {
        newTags = tags.filter(t => t !== tagName);
    } else {
        newTags = [...tags, tagName];
    }

    if (firebaseEnabled && meme.firebaseId) {
        try {
            await db.collection('memes').doc(meme.firebaseId).update({
                tags: newTags
            });
            showToast(hasTag ? '已移除' : '已添加');
        } catch (e) {
            console.error('修改标签失败:', e);
            alert('修改标签失败: ' + e.message);
            return;
        }
    }

    meme.tags = newTags;
    renderMemes();
    updateHotList();
}

// 已发布批量管理
function showBulkManageModal() {
    if (!isAdmin) {
        showToast('请先登录管理员账号');
        return;
    }
    selectedMemeIds.clear();
    const modal = document.getElementById('bulkManageModal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
    renderBulkManageList();
}

function closeBulkManageModal() {
    const modal = document.getElementById('bulkManageModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
    selectedMemeIds.clear();
    renderMemes();
}

function renderBulkManageList() {
    const list = document.getElementById('bulkManageList');
    if (!list) return;

    if (memesData.length === 0) {
        list.innerHTML = '<p style="text-align:center;color:#999;padding:20px;">暂无已发布内容</p>';
        return;
    }

    list.innerHTML = memesData.map(meme => {
        const memeId = meme.firebaseId || meme.id;
        const isSelected = selectedMemeIds.has(memeId);
        const tags = meme.tags || [];
        const tagText = [];
        if (tags.includes('featured')) tagText.push('精选');
        if (tags.includes('recommended')) tagText.push('推荐');
        return `
            <div class="bulk-manage-item ${isSelected ? 'selected' : ''}" data-id="${memeId}" onclick="toggleMemeSelection('${memeId}')">
                <input type="checkbox" class="manage-checkbox" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation(); toggleMemeSelection('${memeId}')">
                <img src="${getOptimizedUrl(meme.url, 200)}" alt="${escapeHtml(meme.title || '未命名')}" loading="lazy">
                <div class="manage-title">${escapeHtml(meme.title || '未命名')}${tagText.length ? ' <span style="color:var(--primary);">(' + tagText.join(',') + ')</span>' : ''}</div>
            </div>
        `;
    }).join('');
}

function toggleMemeSelection(id) {
    if (!isAdmin) return;
    if (selectedMemeIds.has(id)) {
        selectedMemeIds.delete(id);
    } else {
        selectedMemeIds.add(id);
    }
    renderMemes();
    const list = document.getElementById('bulkManageList');
    if (list && document.getElementById('bulkManageModal').classList.contains('active')) {
        renderBulkManageList();
    }
}

function selectAllMemes() {
    if (!isAdmin) return;
    if (selectedMemeIds.size === memesData.length) {
        selectedMemeIds.clear();
    } else {
        memesData.forEach(meme => selectedMemeIds.add(meme.firebaseId || meme.id));
    }
    renderMemes();
    renderBulkManageList();
}

async function batchManageTag(tagName, add) {
    if (!isAdmin) return;
    if (selectedMemeIds.size === 0) {
        showToast('请先选择要操作的图片');
        return;
    }

    showToast(`正在批量${add ? '添加' : '移除'}标签...`);
    let successCount = 0;

    for (const id of selectedMemeIds) {
        const meme = memesData.find(m => (m.firebaseId || m.id) == id);
        if (!meme) continue;

        const tags = [...(meme.tags || [])];
        const hasTag = tags.includes(tagName);
        let newTags = tags;

        if (add && !hasTag) {
            newTags = [...tags, tagName];
        } else if (!add && hasTag) {
            newTags = tags.filter(t => t !== tagName);
        }

        if (JSON.stringify(tags) === JSON.stringify(newTags)) {
            successCount++;
            continue;
        }

        if (firebaseEnabled && meme.firebaseId) {
            try {
                await db.collection('memes').doc(meme.firebaseId).update({ tags: newTags });
                successCount++;
            } catch (e) {
                console.error(`批量标签失败 (${id}):`, e);
            }
        } else {
            successCount++;
        }
        meme.tags = newTags;
    }

    showToast(`成功处理 ${successCount}/${selectedMemeIds.size} 条`);
    renderMemes();
    updateHotList();
    renderBulkManageList();
}

async function batchManageCategory(categoryName, add) {
    if (!isAdmin) return;
    if (selectedMemeIds.size === 0) {
        showToast('请先选择要操作的图片');
        return;
    }

    const label = CATEGORY_LABELS[categoryName] || categoryName;
    showToast(`正在批量${add ? '添加' : '移除'}${label}分类...`);
    let successCount = 0;

    for (const id of selectedMemeIds) {
        const meme = memesData.find(m => (m.firebaseId || m.id) == id);
        if (!meme) continue;

        const category = [...(meme.category || [])];
        const hasCat = category.includes(categoryName);
        let newCategory = category;

        if (add && !hasCat) {
            newCategory = [...category, categoryName];
        } else if (!add && hasCat) {
            newCategory = category.filter(c => c !== categoryName);
        }

        if (JSON.stringify(category) === JSON.stringify(newCategory)) {
            successCount++;
            continue;
        }

        if (firebaseEnabled && meme.firebaseId) {
            try {
                await db.collection('memes').doc(meme.firebaseId).update({ category: newCategory });
                successCount++;
            } catch (e) {
                console.error(`批量分类失败 (${id}):`, e);
            }
        } else {
            successCount++;
        }
        meme.category = newCategory;
    }

    showToast(`成功处理 ${successCount}/${selectedMemeIds.size} 条`);
    renderMemes();
    renderBulkManageList();
}

async function batchDeleteMemes() {
    if (!isAdmin) return;
    if (selectedMemeIds.size === 0) {
        showToast('请先选择要删除的图片');
        return;
    }

    if (!confirm(`确定要批量删除 ${selectedMemeIds.size} 条内容吗？此操作不可恢复！`)) return;

    showToast('正在批量删除...');
    let successCount = 0;

    for (const id of selectedMemeIds) {
        const meme = memesData.find(m => (m.firebaseId || m.id) == id);
        if (!meme) continue;

        if (firebaseEnabled && meme.firebaseId) {
            try {
                await db.collection('memes').doc(meme.firebaseId).delete();
                successCount++;
            } catch (e) {
                console.error(`批量删除失败 (${id}):`, e);
            }
        } else {
            successCount++;
        }
    }

    memesData = memesData.filter(m => !selectedMemeIds.has(m.firebaseId || m.id));
    selectedMemeIds.clear();
    showToast(`成功删除 ${successCount} 条内容`);
    renderMemes();
    updateHotList();
    renderBulkManageList();
}

// 文件转 Base64
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// 上传图片到 Cloudinary
async function uploadToCloudinary(file) {
    if (!cloudinaryConfig || !cloudinaryConfig.cloudName || !cloudinaryConfig.uploadPreset) {
        throw new Error('Cloudinary 配置不完整，请检查 js/cloudinary-config.js');
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', cloudinaryConfig.uploadPreset);
    formData.append('folder', 'phoebe_hub');

    const response = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/image/upload`,
        {
            method: 'POST',
            body: formData
        }
    );

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `上传失败: ${response.status}`);
    }

    const data = await response.json();
    return data.secure_url;
}

// Toast提示
function showToast(message) {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        top: 90px;
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%);
        color: white;
        padding: 14px 28px;
        border-radius: 30px;
        font-weight: 800;
        z-index: 5000;
        box-shadow: 0 6px 25px rgba(159, 122, 234, 0.4);
        animation: slideDown 0.3s ease-out;
        font-size: 15px;
        letter-spacing: 0.5px;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

// 回到顶部
function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// 键盘事件
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeLightbox();
        closeUploadModal();
        closeNoticeModal();
        closeLoginModal();
        closeBatchUploadModal();
        closeBulkManageModal();
    }
});

// 公告弹窗
document.addEventListener('DOMContentLoaded', () => {
    // 检查是否需要显示公告
    if (shouldShowNotice()) {
        setTimeout(() => {
            openNoticeModal();
        }, 1500);
    }
});

function shouldShowNotice() {
    const now = Date.now();

    // 如果点了"我已点星"，24 小时内不显示
    const starredAt = localStorage.getItem('phoebeNoticeStarredAt');
    if (starredAt && now - parseInt(starredAt) < 24 * 60 * 60 * 1000) {
        return false;
    }

    // 如果点了关闭，10 分钟内不显示
    const closedAt = localStorage.getItem('phoebeNoticeClosedAt');
    if (closedAt && now - parseInt(closedAt) < 10 * 60 * 1000) {
        return false;
    }

    return true;
}

function openNoticeModal() {
    const modal = document.getElementById('noticeModal');
    if (modal) {
        modal.classList.add('show');
        document.body.style.overflow = 'hidden';
    }
}

function closeNoticeModal() {
    const modal = document.getElementById('noticeModal');
    if (modal) {
        modal.classList.remove('show');
        document.body.style.overflow = '';
    }
    localStorage.setItem('phoebeNoticeClosedAt', Date.now().toString());
}

function markNoticeStarred() {
    localStorage.setItem('phoebeNoticeStarredAt', Date.now().toString());
    closeNoticeModal();
    showToast('感谢你的 Star！菲比啾比 ~');
}
