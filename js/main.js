// 初始化 Firebase
let db = null;
let firebaseApp = null;
let firebaseEnabled = false;

try {
    if (typeof firebase !== 'undefined' && firebaseConfig && firebaseConfig.projectId !== 'YOUR_PROJECT_ID') {
        firebaseApp = firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
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

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    createParticles();
    renderCharacters();
    initUploadModal();
    initAdminPanel();
    loadData();
});

// 从 Firebase 加载数据
async function loadData() {
    if (firebaseEnabled) {
        try {
            // 读取已发布的表情包
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

            // 读取待审核数据
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

            dataLoaded = true;
            console.log('从 Firebase 加载数据成功');
        } catch (e) {
            console.error('从 Firebase 加载数据失败:', e);
            // 失败时使用本地数据
            useLocalData();
        }
    } else {
        useLocalData();
    }

    renderMemes();
    updateHotList();
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
        } else {
            filtered = filtered.filter(m => {
                const cats = m.category || [];
                const tags = m.tags || [];
                return cats.includes(currentCategory) || tags.includes(currentCategory);
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
                ${isAdmin ? `
                <div class="admin-actions">
                    <button class="admin-btn edit" onclick="event.stopPropagation(); editMemeName('${meme.firebaseId || meme.id}')">改名</button>
                    <button class="admin-btn delete" onclick="event.stopPropagation(); deleteMeme('${meme.firebaseId || meme.id}')">删除</button>
                    <button class="admin-btn tag" onclick="event.stopPropagation(); editMemeTags('${meme.firebaseId || meme.id}')">标签</button>
                </div>
                ` : ''}
            </div>
        </div>
    `).join('');
}

// 渲染表情包的标签
function renderMemeTags(meme) {
    const allTags = [...(meme.category || []), ...(meme.tags || [])];
    const uniqueTags = [...new Set(allTags)].filter(tag => tag && tag !== 'static' && tag !== 'gif');

    if (uniqueTags.length === 0) return '';

    const tagNames = {
        'cute': '超可爱',
        'meme': '梗图',
        'maid': '女仆装',
        'funny': '搞笑',
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
    const link = document.createElement('a');
    link.href = meme.url;
    link.download = `${meme.title || '菲比'}.jpg`;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
            // 1. 将图片转为 Base64
            const base64Image = await fileToBase64(file);

            // 2. 压缩图片（如果太大）
            const compressedImage = await compressImage(base64Image, file.type, 1024, 0.85);

            // 3. 保存到 Firestore pending 集合
            await db.collection('pending').add({
                title: name,
                url: compressedImage,
                category: [category],
                isGif: file.type === 'image/gif',
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
    if (!firebaseEnabled) return;
    try {
        const snapshot = await db.collection('pending').orderBy('createdAt', 'desc').get();
        pendingData = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                firebaseId: doc.id,
                title: data.title,
                url: data.url,
                category: data.category || ['cute'],
                isGif: data.isGif || false,
                date: data.date || new Date().toISOString().split('T')[0],
                createdAt: data.createdAt ? data.createdAt.toDate() : new Date()
            };
        });
        renderAdminPanel();
    } catch (e) {
        console.error('刷新待审核列表失败:', e);
    }
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
        const input = prompt('请输入验证信息：');
        if (!input) return;

        const p1 = String.fromCharCode(112, 98);
        const p2 = String.fromCharCode(113, 98);
        const p3 = String.fromCharCode(120, 119, 100);
        const p4 = String.fromCharCode(53, 50, 48, 49, 51, 49, 52);
        const key = p1 + p2 + p3 + p4;

        if (input === key) {
            isAdmin = true;
            showToast('管理员登录成功！');
            refreshPendingList().then(() => renderAdminPanel());
        } else {
            showToast('验证失败！');
        }
    } else {
        isAdmin = false;
        const panel = document.getElementById('adminPanel');
        if (panel) panel.classList.remove('active');
        showToast('已退出管理员模式');
    }
}

function renderAdminPanel() {
    const panel = document.getElementById('adminPanel');
    if (!panel) return;

    panel.classList.add('active');

    if (pendingData.length === 0) {
        panel.innerHTML = `
            <h3>审核面板</h3>
            <p style="text-align: center; color: #999; padding: 20px;">暂无待审核内容</p>
            <button class="review-btn approve" onclick="loadData()" style="width: 100%; margin-top: 10px;">刷新数据</button>
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
        <button class="review-btn approve" onclick="loadData()" style="width: 100%; margin-top: 15px;">刷新全部数据</button>
    `;
}

// 审核通过
async function approveMeme(firebaseId, index) {
    if (!firebaseEnabled) return;

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
    if (!firebaseEnabled) return;

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

// 修改表情包的标签（精选、站长推荐等）
async function editMemeTags(id) {
    if (!isAdmin) return;

    const meme = memesData.find(m => (m.firebaseId || m.id) == id);
    if (!meme) return;

    const currentTags = [...new Set([...(meme.category || []), ...(meme.tags || [])])].filter(t => t && t !== 'static' && t !== 'gif');
    const input = prompt('请输入标签，用逗号分隔：\n可选：cute（超可爱）, meme（梗图）, maid（女仆装）, funny（搞笑）, featured（精选）, recommended（站长推荐）\n\n当前标签：' + (currentTags.join(', ') || '无'), currentTags.join(', '));

    if (input === null) return;

    const newTags = input.split(',').map(t => t.trim()).filter(t => t !== '');

    // 保持 category 中的 cute/meme/maid/funny，把 featured/recommended 放到 tags
    const categoryTags = newTags.filter(t => ['cute', 'meme', 'maid', 'funny'].includes(t));
    const specialTags = newTags.filter(t => ['featured', 'recommended'].includes(t));

    if (firebaseEnabled && meme.firebaseId) {
        try {
            await db.collection('memes').doc(meme.firebaseId).update({
                category: categoryTags.length > 0 ? categoryTags : ['cute'],
                tags: specialTags
            });
            showToast('标签修改成功！');
        } catch (e) {
            console.error('修改标签失败:', e);
            alert('修改标签失败: ' + e.message);
            return;
        }
    }

    meme.category = categoryTags.length > 0 ? categoryTags : ['cute'];
    meme.tags = specialTags;
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
    }
});
