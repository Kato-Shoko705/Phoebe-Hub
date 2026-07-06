// Phoebe Hub - 纯静态版本
// 数据来源：data/memes.json + images/ 文件夹

let memesData = [];
let currentCategory = 'all';
let currentSort = 'newest';
let searchQuery = '';
let dataLoaded = false;
let bulkModeOpen = false;
let bulkSelectedIds = new Set();

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

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    createParticles();
    renderCharacters();
    initLazyLoad();
    loadData();
});

// 加载本地静态数据
async function loadData() {
    try {
        const response = await fetch('data/memes.json');
        if (!response.ok) throw new Error('加载数据失败');
        const data = await response.json();
        memesData = (data.memes || []).map((m, idx) => ({
            id: m.id || idx + 1,
            title: m.title || '未命名',
            url: m.url,
            category: m.category || ['cute'],
            views: m.views || 0,
            downloads: m.downloads || 0,
            date: m.date || new Date().toISOString().split('T')[0],
            isGif: m.isGif || false,
            hot: m.hot || 0,
            tags: m.tags || []
        }));
        dataLoaded = true;
        console.log(`从 data/memes.json 加载了 ${memesData.length} 个表情包`);
    } catch (e) {
        console.error('加载数据失败:', e);
        useLocalFallback();
        showLoadError();
    }
    renderMemes();
    updateHotList();
}

function showLoadError() {
    const grid = document.getElementById('memeGrid');
    if (!grid) return;
    const existing = document.getElementById('loadErrorBanner');
    if (existing) existing.remove();

    const banner = document.createElement('div');
    banner.id = 'loadErrorBanner';
    banner.style.cssText = `
        grid-column: 1/-1;
        background: rgba(244, 67, 54, 0.1);
        border: 1px solid rgba(244, 67, 54, 0.3);
        border-radius: 16px;
        padding: 16px 20px;
        margin-bottom: 20px;
        color: #C62828;
        font-weight: 700;
        font-size: 14px;
        line-height: 1.6;
    `;
    banner.innerHTML = `
        本地数据加载失败，当前只显示示例图片。<br>
        请使用本地服务器预览：在仓库根目录运行 <code style="background:rgba(0,0,0,0.05);padding:2px 6px;border-radius:4px;">python -m http.server 8000</code>，然后访问 <code style="background:rgba(0,0,0,0.05);padding:2px 6px;border-radius:4px;">http://localhost:8000</code>
    `;
    grid.insertBefore(banner, grid.firstChild);
}

// 备用数据
function useLocalFallback() {
    memesData = [
        {
            id: 1,
            title: "誓死效忠米哈游",
            url: "images/誓死效忠米哈游.jpg",
            category: ["meme"],
            views: 0,
            downloads: 0,
            date: "2025-06-15",
            isGif: false,
            hot: 0
        },
        {
            id: 2,
            title: "菲比猪鼻",
            url: "images/菲比猪鼻.jpg",
            category: ["cute"],
            views: 0,
            downloads: 0,
            date: "2025-06-14",
            isGif: false,
            hot: 0
        },
        {
            id: 3,
            title: "你这无礼之徒",
            url: "images/你这无礼之徒.jpg",
            category: ["meme"],
            views: 0,
            downloads: 0,
            date: "2025-06-13",
            isGif: false,
            hot: 0
        },
        {
            id: 4,
            title: "少爷，该启动鸣潮了哈哈",
            url: "images/少爷，该启动鸣潮了哈哈.jpg",
            category: ["cute"],
            views: 0,
            downloads: 0,
            date: "2025-06-12",
            isGif: false,
            hot: 0
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

// 获取图片 URL（静态部署直接返回原 URL）
function getOptimizedUrl(url) {
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
        filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
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
        const optimizedUrl = getOptimizedUrl(meme.url);
        const fullUrl = meme.url;
        const safeTitle = escapeHtml(meme.title || '未命名');
        const isSelected = bulkSelectedIds.has(meme.id);
        const checkboxHtml = bulkModeOpen ? `
            <label class="bulk-checkbox" onclick="event.stopPropagation()">
                <input type="checkbox" ${isSelected ? 'checked' : ''}
                    onchange="toggleBulkSelection(${meme.id}, this.checked)"
                    onclick="event.stopPropagation()">
            </label>
        ` : '';
        return `
        <div class="meme-card ${bulkModeOpen ? 'bulk-mode' : ''} ${isSelected ? 'bulk-selected' : ''}" data-id="${meme.id}">
            ${checkboxHtml}
            <img data-src="${optimizedUrl}" data-full="${fullUrl}" alt="${safeTitle}" class="meme-image ${meme.isGif ? 'gif-image' : ''} lazy" loading="lazy"
                onerror="this.src='https://via.placeholder.com/300x300/B794F6/FFFFFF?text=${encodeURIComponent(meme.title || '菲比')}'"
                onclick="handleMemeClick(event, '${fullUrl}', ${meme.id})"
                onload="this.classList.add('loaded')">
            <div class="meme-info">
                <div class="meme-title">${safeTitle}</div>
                ${renderMemeTags(meme)}
                <div class="meme-meta">
                    <span>${meme.date || ''}</span>
                    ${(meme.hot || 0) >= 80 ? '<span style="color:#FF6B6B;font-weight:800;">🔥 热门</span>' : ''}
                </div>
                <div class="meme-actions">
                    <div class="meme-type ${meme.isGif ? 'gif' : 'static'}">
                        ${meme.isGif ? '动态图片' : '静态图片'}
                    </div>
                    <button class="download-btn" onclick="event.stopPropagation(); downloadMeme('${meme.id}')" title="下载">
                        下载
                    </button>
                </div>
            </div>
        </div>
    `}).join('');

    // 初始化懒加载观察
    document.querySelectorAll('.meme-image.lazy').forEach(img => {
        if (window.observeImage) window.observeImage(img);
    });

    // 同步批量下载全选状态
    if (bulkModeOpen) {
        updateBulkSelectAllState();
    }
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

// 更新热门列表（只显示 hot > 0 的项目）
function updateHotList() {
    const hotList = document.getElementById('hotList');
    if (!hotList) return;

    const sorted = [...memesData]
        .filter(m => (m.hot || 0) > 0)
        .sort((a, b) => (b.hot || 0) - (a.hot || 0))
        .slice(0, 6);

    if (sorted.length === 0) {
        hotList.innerHTML = `
            <div class="hot-item" style="justify-content:center;color:#999;font-size:13px;">
                暂无热门推荐，请到管理助手设置热度
            </div>
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

// 下载表情包
async function downloadMeme(id) {
    const meme = memesData.find(m => m.id == id);
    if (!meme) return;

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

        setTimeout(() => window.URL.revokeObjectURL(blobUrl), 1000);
        showToast('下载成功！');
    } catch (e) {
        console.error('下载失败:', e);
        const link = document.createElement('a');
        link.href = meme.url;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

// ===== 批量下载 =====
function toggleBulkMode() {
    bulkModeOpen = !bulkModeOpen;
    if (!bulkModeOpen) {
        bulkSelectedIds.clear();
    }
    const toolbar = document.getElementById('bulkToolbar');
    if (toolbar) toolbar.style.display = bulkModeOpen ? 'flex' : 'none';
    const selectAll = document.getElementById('bulkSelectAll');
    if (selectAll) selectAll.checked = false;
    updateBulkCount();
    renderMemes();
}

function handleMemeClick(event, url, id) {
    if (bulkModeOpen) {
        event.preventDefault();
        event.stopPropagation();
        toggleBulkSelection(id, !bulkSelectedIds.has(id));
        return;
    }
    openLightbox(url);
}

function toggleBulkSelection(id, checked) {
    if (checked) {
        bulkSelectedIds.add(id);
    } else {
        bulkSelectedIds.delete(id);
    }
    renderMemes();
    updateBulkCount();
    updateBulkSelectAllState();
}

function updateBulkSelectAllState() {
    const grid = document.getElementById('memeGrid');
    if (!grid) return;
    const visibleCards = grid.querySelectorAll('.meme-card');
    const selectAll = document.getElementById('bulkSelectAll');
    if (!selectAll) return;
    if (visibleCards.length === 0) {
        selectAll.checked = false;
        selectAll.indeterminate = false;
        return;
    }
    const visibleIds = Array.from(visibleCards).map(card => parseInt(card.dataset.id));
    const selectedVisible = visibleIds.filter(id => bulkSelectedIds.has(id));
    if (selectedVisible.length === 0) {
        selectAll.checked = false;
        selectAll.indeterminate = false;
    } else if (selectedVisible.length === visibleIds.length) {
        selectAll.checked = true;
        selectAll.indeterminate = false;
    } else {
        selectAll.checked = false;
        selectAll.indeterminate = true;
    }
}

function selectAllBulk(checkbox) {
    const grid = document.getElementById('memeGrid');
    if (!grid) return;
    const visibleCards = grid.querySelectorAll('.meme-card');
    const visibleIds = Array.from(visibleCards).map(card => parseInt(card.dataset.id));
    if (checkbox.checked) {
        visibleIds.forEach(id => bulkSelectedIds.add(id));
    } else {
        visibleIds.forEach(id => bulkSelectedIds.delete(id));
    }
    renderMemes();
    updateBulkCount();
}

function updateBulkCount() {
    const countEl = document.getElementById('bulkCount');
    if (countEl) countEl.textContent = bulkSelectedIds.size;
}

function sanitizeFileName(name) {
    return String(name || '菲比')
        .replace(/[\\/:*?"<>|]/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80) || '菲比';
}

function getExtensionFromUrl(url, isGif) {
    if (isGif) return 'gif';
    const match = String(url || '').match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
    if (match) return match[1].toLowerCase();
    return 'jpg';
}

async function downloadBulkZip() {
    if (bulkSelectedIds.size === 0) {
        showToast('请先选择要下载的菲比 ~');
        return;
    }
    if (typeof JSZip === 'undefined') {
        showToast('下载组件加载中，请稍后重试');
        return;
    }

    const selectedMemes = memesData.filter(m => bulkSelectedIds.has(m.id));
    showToast(`开始打包 ${selectedMemes.length} 个菲比...`);

    const zip = new JSZip();
    const usedNames = new Set();
    let successCount = 0;
    let failCount = 0;

    const fetchPromises = selectedMemes.map(async (meme) => {
        try {
            const response = await fetch(meme.url);
            if (!response.ok) throw new Error('fetch failed');
            const blob = await response.blob();

            let baseName = sanitizeFileName(meme.title || '菲比');
            let ext = getExtensionFromUrl(meme.url, meme.isGif);
            let fileName = `${baseName}.${ext}`;
            if (usedNames.has(fileName)) {
                fileName = `${baseName}_${meme.id}.${ext}`;
            }
            if (usedNames.has(fileName)) {
                fileName = `${baseName}_${meme.id}_${Date.now()}.${ext}`;
            }
            usedNames.add(fileName);
            zip.file(fileName, blob);
            successCount++;
        } catch (e) {
            console.error('打包失败:', meme.id, meme.title, e);
            failCount++;
        }
    });

    await Promise.all(fetchPromises);

    if (successCount === 0) {
        showToast('打包失败，请检查网络后重试');
        return;
    }

    try {
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const zipUrl = URL.createObjectURL(zipBlob);
        const link = document.createElement('a');
        link.href = zipUrl;
        link.download = `PhoebeHub_${selectedMemes.length}个菲比_${new Date().toISOString().slice(0, 10)}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(zipUrl), 1000);

        let msg = `成功打包 ${successCount} 个菲比！`;
        if (failCount > 0) msg += `（${failCount} 个失败）`;
        showToast(msg);
    } catch (e) {
        console.error('生成 zip 失败:', e);
        showToast('生成压缩包失败，请重试');
    }
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

// 显示投稿指引弹窗
function showAddModal() {
    const modal = document.getElementById('uploadModal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

// 关闭投稿指引弹窗
function closeUploadModal() {
    const modal = document.getElementById('uploadModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
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

// ===== 管理员面板 =====
let adminModifications = {};
let adminOpen = false;

const ADMIN_TAG_OPTIONS = [
    { key: 'featured', label: '精选' },
    { key: 'recommended', label: '站长推荐' }
];

function toggleAdminMode() {
    const panel = document.getElementById('adminPanel');
    if (!panel) return;
    adminOpen = !adminOpen;
    if (adminOpen) {
        adminModifications = {};
        panel.classList.add('active');
        document.body.style.overflow = 'hidden';
        renderAdminPanel();
        showToast('管理员模式已开启（Ctrl+Shift+A），修改后点击「下载 memes.json」导出');
    } else {
        panel.classList.remove('active');
        document.body.style.overflow = '';
        adminModifications = {};
        updateAdminChangeCount();
    }
}

function renderAdminPanel() {
    const list = document.getElementById('adminMemeList');
    if (!list) return;

    window._adminMemes = [...memesData];
    list.innerHTML = `
        <div class="admin-search-wrap">
            <input type="text" id="adminSearch" placeholder="搜索表情包名称..." oninput="filterAdminMemes()">
        </div>
        <div class="admin-cards-grid" id="adminCardsGrid"></div>
    `;
    renderAdminCardsGrid();
}

function filterAdminMemes() {
    const q = (document.getElementById('adminSearch') || {}).value || '';
    window._adminMemes = q
        ? memesData.filter(m => m.title && m.title.toLowerCase().includes(q.toLowerCase()))
        : [...memesData];
    renderAdminCardsGrid();
}

function renderAdminCardsGrid() {
    const grid = document.getElementById('adminCardsGrid');
    if (!grid) return;
    const memes = window._adminMemes || memesData;
    grid.innerHTML = memes.map(meme => renderAdminCard(meme)).join('');
}

function renderAdminCard(meme) {
    const currentTags = getAdminTags(meme.id);
    const currentHot = getAdminHot(meme.id);
    const currentDownloads = getAdminDownloads(meme.id);

    return `
    <div class="admin-meme-card" id="adminCard-${meme.id}">
        <div class="admin-meme-top">
            <img src="${meme.url}" alt="${escapeHtml(meme.title || '')}" loading="lazy" onerror="this.src='https://via.placeholder.com/80x80/B794F6/FFFFFF?text=%E8%8F%B2%E6%AF%94'">
            <div class="admin-meme-info">
                <div class="admin-meme-title">${escapeHtml(meme.title || '未命名')}</div>
                <div class="admin-meme-id">ID: ${meme.id} · ${meme.isGif ? 'GIF' : '静态'} · 日期 ${meme.date || ''}</div>
                <div class="admin-tag-row">
                    ${ADMIN_TAG_OPTIONS.map(tag => `
                        <span class="admin-tag-chip${currentTags.includes(tag.key) ? ' selected' : ''}"
                            onclick="toggleAdminTag(${meme.id}, '${tag.key}', this)">${tag.label}</span>
                    `).join('')}
                </div>
                <div class="admin-control-row">
                    <label>热度</label>
                    <input type="range" min="0" max="100" value="${currentHot}"
                        oninput="updateAdminHot(${meme.id}, this.value)">
                    <span class="admin-val hot-val">${currentHot}</span>
                </div>
                <div class="admin-control-row">
                    <label>下载量</label>
                    <input type="number" min="0" value="${currentDownloads}"
                        oninput="updateAdminDownloads(${meme.id}, this.value)">
                </div>
            </div>
        </div>
    </div>
    `;
}

function getAdminTags(id) {
    const key = String(id);
    if (adminModifications[key] && adminModifications[key].tags !== undefined) {
        return adminModifications[key].tags;
    }
    const meme = memesData.find(m => m.id === id);
    return meme ? (meme.tags || []) : [];
}

function getAdminHot(id) {
    const key = String(id);
    if (adminModifications[key] && adminModifications[key].hot !== undefined) {
        return adminModifications[key].hot;
    }
    const meme = memesData.find(m => m.id === id);
    return meme ? (meme.hot || 0) : 0;
}

function getAdminDownloads(id) {
    const key = String(id);
    if (adminModifications[key] && adminModifications[key].downloads !== undefined) {
        return adminModifications[key].downloads;
    }
    const meme = memesData.find(m => m.id === id);
    return meme ? (meme.downloads || 0) : 0;
}

function toggleAdminTag(id, tagKey, el) {
    const key = String(id);
    if (!adminModifications[key]) adminModifications[key] = {};
    if (!adminModifications[key].tags) adminModifications[key].tags = [...getAdminTags(id)];

    const tags = adminModifications[key].tags;
    const idx = tags.indexOf(tagKey);
    if (idx >= 0) {
        tags.splice(idx, 1);
        el.classList.remove('selected');
    } else {
        tags.push(tagKey);
        el.classList.add('selected');
    }
    markCardModified(id);
    updateAdminChangeCount();
}

function updateAdminHot(id, value) {
    const val = parseInt(value) || 0;
    const key = String(id);
    if (!adminModifications[key]) adminModifications[key] = {};
    adminModifications[key].hot = val;

    const card = document.getElementById('adminCard-' + id);
    if (card) {
        const valSpan = card.querySelector('.admin-val.hot-val');
        if (valSpan) valSpan.textContent = val;
    }
    markCardModified(id);
    updateAdminChangeCount();
}

function updateAdminDownloads(id, value) {
    const val = parseInt(value) || 0;
    const key = String(id);
    if (!adminModifications[key]) adminModifications[key] = {};
    adminModifications[key].downloads = val;
    markCardModified(id);
    updateAdminChangeCount();
}

function markCardModified(id) {
    const card = document.getElementById('adminCard-' + id);
    if (card) card.classList.add('modified');
}

function updateAdminChangeCount() {
    const countEl = document.getElementById('adminChangeCount');
    if (!countEl) return;
    const count = Object.keys(adminModifications).length;
    countEl.textContent = '已修改 ' + count + ' 项';
    const toast = document.getElementById('adminToast');
    if (toast) toast.style.display = count > 0 ? 'block' : 'none';
}

function downloadAdminJson() {
    const modified = memesData.map(m => {
        const key = String(m.id);
        const mod = adminModifications[key] || {};
        return {
            ...m,
            tags: mod.tags !== undefined ? mod.tags : (m.tags || []),
            hot: mod.hot !== undefined ? mod.hot : (m.hot || 0),
            downloads: mod.downloads !== undefined ? mod.downloads : (m.downloads || 0)
        };
    });

    const result = {
        memes: modified,
        pending: [],
        nextId: modified.length + 1
    };

    const jsonStr = JSON.stringify(result, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'memes.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('memes.json 已导出，请替换仓库 data/memes.json 后提交推送');
}

// 键盘事件
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        toggleAdminMode();
        return;
    }
    if (e.key === 'Escape') {
        if (adminOpen) {
            toggleAdminMode();
            return;
        }
        closeLightbox();
        closeUploadModal();
        closeNoticeModal();
    }
});

// 公告弹窗
document.addEventListener('DOMContentLoaded', () => {
    if (shouldShowNotice()) {
        setTimeout(() => {
            openNoticeModal();
        }, 1500);
    }
});

function shouldShowNotice() {
    const now = Date.now();

    const starredAt = localStorage.getItem('phoebeNoticeStarredAt');
    if (starredAt && now - parseInt(starredAt) < 24 * 60 * 60 * 1000) {
        return false;
    }

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
