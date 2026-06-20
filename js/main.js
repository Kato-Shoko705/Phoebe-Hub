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
let currentFilteredMemes = [];

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    createParticles();
    renderCharacters();
    initUploadModal();
    initAdminPanel();
    initAuthListener();
    loadData();
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
            <img src="images/菲比猪鼻.jpg" alt="菲比" class="character-avatar" style="border-color: #FF8C42" onerror="this.src='https://via.placeholder.com/100x100/FF8C42/FFFFFF?text=菲比'">
            <div class="character-name">菲比</div>
            <div class="character-role">教士</div>
        </div>
    `;
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

    currentFilteredMemes = filtered;

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

    grid.innerHTML = filtered.map(meme => `
        <div class="meme-card" data-id="${meme.id || meme.firebaseId}">
            <img src="${meme.url}" alt="${meme.title}" class="meme-image ${meme.isGif ? 'gif-image' : ''}" loading="lazy" 
                onerror="this.src='https://via.placeholder.com/300x300/FF8C42/FFFFFF?text=${encodeURIComponent(meme.title || '菲比')}'"
                onclick="openLightbox('${meme.url}')">
            <div class="meme-info">
                <div class="meme-title">${meme.title || '未命名'}</div>
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
    `).join('');
}

// 渲染表情包的标签
function renderMemeTags(meme) {
    const tags = meme.tags || [];
    const uniqueTags = [...new Set(tags)].filter(tag => tag && tag !== 'static' && tag !== 'gif');

    if (uniqueTags.length === 0) return '';

    const tagNames = {
        'featured': '精选',
        'recommended': '站长推荐'
    };

    return `
        <div class="meme-tags">
            ${uniqueTags.map(tag => `
                <span class="meme-tag ${tag}">${tagNames[tag] || tag}</span>
            `).join('')}
        </div>
    `;
}

// 渲染管理员操作按钮
function renderAdminActions(meme) {
    const tags = meme.tags || [];
    const isFeatured = tags.includes('featured');
    const isRecommended = tags.includes('recommended');

    return `
        <div class="admin-actions">
            <button class="admin-btn edit" onclick="event.stopPropagation(); editMemeName('${meme.firebaseId || meme.id}')">改名</button>
            <button class="admin-btn tag" onclick="event.stopPropagation(); toggleTag('${meme.firebaseId || meme.id}', 'featured')">
                ${isFeatured ? '移除精选' : '设为精选'}
            </button>
            <button class="admin-btn tag-purple" onclick="event.stopPropagation(); toggleTag('${meme.firebaseId || meme.id}', 'recommended')">
                ${isRecommended ? '移除推荐' : '站长推荐'}
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

    hotList.innerHTML = sorted.map((meme, index) => `
        <div class="hot-item" onclick="searchByTitle('${meme.title}')">
            <div class="hot-rank ${index < 3 ? 'top' : ''}">${index + 1}</div>
            <span class="hot-text">${meme.title || '未命名'}</span>
        </div>
    `).join('');
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

// 下载表情包
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

    // 执行下载
    const extension = meme.isGif ? 'gif' : 'jpg';
    const link = document.createElement('a');
    link.href = meme.url;
    link.download = `${meme.title || '菲比'}.${extension}`;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// 批量下载当前表情包为压缩包
async function batchDownloadAll() {
    if (typeof JSZip === 'undefined') {
        alert('批量下载组件加载失败，请刷新页面重试。');
        return;
    }

    const memes = currentFilteredMemes && currentFilteredMemes.length > 0
        ? currentFilteredMemes
        : memesData;

    if (memes.length === 0) {
        showToast('当前没有可下载的菲比~');
        return;
    }

    const zip = new JSZip();
    const usedNames = new Set();
    let successCount = 0;
    let failCount = 0;

    showToast(`正在打包 ${memes.length} 张菲比，请稍候...`);

    for (const meme of memes) {
        if (!meme.url) continue;

        try {
            const response = await fetch(meme.url, { mode: 'cors' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const blob = await response.blob();

            const safeTitle = (meme.title || '菲比').replace(/[\\/:*?"<>|]/g, '_').trim() || '菲比';
            let ext = meme.isGif ? 'gif' : '';
            if (!ext) {
                const urlPath = new URL(meme.url, window.location.href).pathname;
                const matched = urlPath.match(/\.([a-zA-Z0-9]+)$/);
                if (matched) {
                    ext = matched[1].toLowerCase();
                } else if (blob.type) {
                    const typeMap = {
                        'image/gif': 'gif',
                        'image/png': 'png',
                        'image/webp': 'webp',
                        'image/jpeg': 'jpg'
                    };
                    ext = typeMap[blob.type] || 'jpg';
                } else {
                    ext = 'jpg';
                }
            }

            let fileName = `${safeTitle}.${ext}`;
            if (usedNames.has(fileName)) {
                let i = 2;
                while (usedNames.has(`${safeTitle}_${i}.${ext}`)) i++;
                fileName = `${safeTitle}_${i}.${ext}`;
            }
            usedNames.add(fileName);

            zip.file(fileName, blob);
            successCount++;
        } catch (err) {
            console.error(`打包失败: ${meme.title || meme.url}`, err);
            failCount++;
        }
    }

    if (successCount === 0) {
        showToast('打包失败，请检查网络或图片链接。');
        return;
    }

    try {
        const content = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(content);
        const link = document.createElement('a');
        link.href = url;
        link.download = `菲比表情包_${new Date().toISOString().slice(0, 10)}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        if (failCount > 0) {
            showToast(`已打包 ${successCount} 张，${failCount} 张失败。`);
        } else {
            showToast(`成功打包 ${successCount} 张菲比！`);
        }
    } catch (err) {
        console.error('生成压缩包失败:', err);
        showToast('生成压缩包失败，请重试。');
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
    const preview = document.getElementById('previewImage');
    const fileUpload = document.querySelector('.file-upload');

    if (fileUpload && fileInput) {
        fileUpload.addEventListener('click', () => fileInput.click());

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file && preview) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    preview.src = event.target.result;
                    preview.style.display = 'block';
                };
                reader.readAsDataURL(file);
            }
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

// 处理上传 - 上传到 Firebase 待审核
async function handleUpload(event) {
    event.preventDefault();

    if (!firebaseEnabled) {
        alert('Firebase 未配置，无法上传。请先配置 Firebase。');
        return false;
    }

    const fileInput = document.getElementById('uploadFile');
    const nameInput = document.getElementById('phoebeName');
    const categoryInput = document.getElementById('phoebeCategory');

    const file = fileInput.files[0];
    const name = nameInput.value.trim();
    const category = categoryInput.value;

    if (!file) {
            alert('请选择一张菲比图片！');
            return false;
        }

        if (!name) {
            alert('请给菲比起一个可爱的名字！');
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

            // 2. 上传图片到 Cloudinary
            showToast('正在上传图片到云端...');
            const imageUrl = await uploadToCloudinary(file);

            // 3. 保存图片 URL 到 Firestore pending 集合
            await db.collection('pending').add({
                title: name,
                url: imageUrl,
                category: [category],
                isGif: isGif,
                date: new Date().toISOString().split('T')[0],
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                status: 'pending'
            });

            closeUploadModal();
            showToast(`「${name}」已提交审核，请耐心等待~`);

            // 如果管理员面板打开，更新显示
            if (isAdmin) {
                await refreshPendingList();
            }
        } catch (e) {
            console.error('上传失败:', e);
            alert('上传失败: ' + e.message);
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
            <button class="review-btn approve" onclick="refreshAllData()" style="width: 100%; margin-top: 10px;">刷新数据</button>
        `;
        return;
    }

    panel.innerHTML = `
        <h3>审核面板 (${pendingData.length} 条待审核)</h3>
        ${pendingData.map((item, index) => `
            <div class="review-item">
                <img src="${item.url}" alt="${item.title}">
                <div class="review-item-info">
                    <div class="review-item-title">${item.title || '未命名'}</div>
                    <div class="review-item-date">${item.date || ''} | ${item.isGif ? '动态' : '静态'}</div>
                </div>
                <div class="review-actions">
                    <button class="review-btn approve" onclick="approveMeme('${item.firebaseId}', ${index})">通过</button>
                    <button class="review-btn reject" onclick="rejectMeme('${item.firebaseId}', ${index})">拒绝</button>
                </div>
            </div>
        `).join('')}
        <button class="review-btn approve" onclick="refreshAllData()" style="width: 100%; margin-top: 15px;">刷新全部数据</button>
    `;
}

// 刷新公开数据和待审核数据
function refreshAllData() {
    location.reload();
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

        await db.collection('memes').add(newMemeData);

        // 2. 从 pending 删除
        await db.collection('pending').doc(firebaseId).delete();

        // 3. 更新本地数据
        pendingData.splice(index, 1);
        showToast(`「${meme.title}」审核通过！`);

        // 4. 重新加载数据
        await loadData();
        renderAdminPanel();
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
        renderAdminPanel();
        showToast(`「${meme.title}」已拒绝`);
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

// 压缩图片
function compressImage(base64, type, maxWidth, quality) {
    return new Promise((resolve) => {
        const img = new Image();
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

            const compressed = canvas.toDataURL(type, quality);
            resolve(compressed);
        };
        img.src = base64;
    });
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
        box-shadow: 0 6px 25px rgba(255, 122, 61, 0.4);
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
    // 每次进入站点都显示迁移公告
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
}

function markNoticeStarred() {
    closeNoticeModal();
}
