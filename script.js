const STORAGE_KEY = "inventory_items_v2";
let currentCategory = "all";
let currentSearch = "";
let navExpanded = false;
let editingItemId = null;
let toastTimer = null;

const categoryNames = { food: "食品", daily: "日用品", medicine: "药品" };
const categoryEmoji = { food: "🍎", daily: "📦", medicine: "💊" };

// ===== 工具函数 =====

function getExpiryStatus(expiryDate) {
    if (!expiryDate) return { isExpiring: false, isExpired: false };
    const today = new Date(); today.setHours(0,0,0,0);
    const target = new Date(expiryDate); target.setHours(0,0,0,0);
    const diffDays = Math.ceil((target - today) / (1000*60*60*24));
    return { isExpired: diffDays < 0, isExpiring: diffDays >=0 && diffDays <=60 };
}

function getItems() { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
function saveItems(items) { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); }

function generateId() {
    return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
}

// ===== Toast =====

function showToast(msg) {
    const toast = document.getElementById("toast");
    toast.querySelector(".toast-text").textContent = msg;
    toast.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 1800);
}

// ===== 渲染物资列表 =====

function renderItems() {
    let items = getItems();

    items.sort((a, b) => {
        const sA = getExpiryStatus(a.expiryDate), sB = getExpiryStatus(b.expiryDate);
        const scoreA = sA.isExpired ? 2 : (sA.isExpiring ? 1 : 0);
        const scoreB = sB.isExpired ? 2 : (sB.isExpiring ? 1 : 0);
        if (scoreB !== scoreA) return scoreB - scoreA;
        return new Date(a.expiryDate) - new Date(b.expiryDate);
    });

    if (currentCategory !== "all") items = items.filter(i => i.category === currentCategory);
    if (currentSearch.trim()) {
        const keyword = currentSearch.trim().toLowerCase();
        items = items.filter(i => i.name.toLowerCase().includes(keyword));
    }

    const container = document.getElementById("itemsContainer");
    const emptyState = document.getElementById("emptyState");
    const existingCards = container.querySelectorAll(".item-card");
    const existingIds = new Set();
    existingCards.forEach(c => existingIds.add(c.dataset.id));
    const newIds = new Set(items.map(i => String(i.id)));

    // 移除不存在的卡片
    existingCards.forEach(card => {
        if (!newIds.has(card.dataset.id)) {
            card.classList.add("removing");
            card.addEventListener("animationend", () => card.remove(), { once: true });
        }
    });

    // 添加新卡片或保留已有卡片
    if (items.length === 0) {
        container.innerHTML = "";
        container.appendChild(createEmptyState());
        const clearBtn = document.getElementById("clearSearch");
        if (clearBtn) clearBtn.classList.remove("visible");
        lucide.createIcons();
        return;
    }

    // 移除空状态
    if (emptyState) emptyState.remove();

    const fragment = document.createDocumentFragment();
    items.forEach((item, index) => {
        const idStr = String(item.id);
        if (existingIds.has(idStr)) {
            // 更新已有卡片的位置（用动画延迟）
            const existingCard = container.querySelector(`.item-card[data-id="${idStr}"]`);
            if (existingCard) {
                existingCard.style.animationDelay = `${index * 0.03}s`;
                fragment.appendChild(existingCard);
            }
        } else {
            // 创建新卡片
            const card = createItemCard(item);
            card.style.animationDelay = `${index * 0.04}s`;
            fragment.appendChild(card);
        }
    });

    container.innerHTML = "";
    container.appendChild(fragment);
    lucide.createIcons();

    // 更新清除按钮
    const clearBtn = document.getElementById("clearSearch");
    if (clearBtn) {
        clearBtn.classList.toggle("visible", currentSearch.trim().length > 0);
    }
}

function createEmptyState() {
    const div = document.createElement("div");
    div.className = "empty-state";
    div.id = "emptyState";
    div.innerHTML = `
        <div class="empty-icon-wrapper">
            <i data-lucide="package-open" class="empty-icon"></i>
        </div>
        <p class="empty-title">暂无物资</p>
        <p class="empty-subtitle">点击下方 + 按钮添加</p>
    `;
    return div;
}

function createItemCard(item) {
    const status = getExpiryStatus(item.expiryDate);
    const card = document.createElement("div");
    card.className = "item-card";
    card.dataset.id = item.id;

    if (status.isExpired) {
        card.classList.add("warning-border");
    } else if (status.isExpiring) {
        card.classList.add("warning-border");
    }

    // 左侧信息
    const left = document.createElement("div");
    const nameEl = document.createElement("div");
    nameEl.className = "item-name";
    nameEl.textContent = item.name;
    const catEl = document.createElement("div");
    catEl.className = "item-category";
    catEl.textContent = categoryNames[item.category] || "未分类";
    left.appendChild(nameEl);
    left.appendChild(catEl);

    // 右侧信息
    const right = document.createElement("div");
    const qtyEl = document.createElement("div");
    qtyEl.className = "item-quantity";
    qtyEl.textContent = item.quantity;
    const unitSpan = document.createElement("span");
    unitSpan.className = "item-unit";
    unitSpan.textContent = item.unit;
    qtyEl.appendChild(unitSpan);
    right.appendChild(qtyEl);

    // 过期标签
    if (status.isExpired) {
        const badge = document.createElement("div");
        badge.className = "expire-badge expired";
        badge.textContent = "❌ 已过期";
        right.appendChild(badge);
    } else if (status.isExpiring) {
        const badge = document.createElement("div");
        badge.className = "expire-badge expiring";
        badge.textContent = "⚠️ 即将过期";
        right.appendChild(badge);
    }

    const footer = document.createElement("div");
    footer.className = "items-footer";
    footer.textContent = `有效期至: ${item.expiryDate || "未设置"}`;
    right.appendChild(footer);

    card.appendChild(left);
    card.appendChild(right);

    card.addEventListener("click", () => openEditModal(item.id));

    return card;
}

// ===== 搜索 =====

function searchItems() {
    currentSearch = document.getElementById("searchInput").value;
    renderItems();
}

function clearSearch() {
    document.getElementById("searchInput").value = "";
    currentSearch = "";
    renderItems();
}

// ===== 添加弹窗 =====

function openAddModal() {
    document.getElementById("addModal").classList.add("visible");
    document.getElementById("addForm").reset();
    document.getElementById("itemQuantity").value = "1";
    document.getElementById("itemName").focus();
}

function closeModal() {
    document.getElementById("addModal").classList.remove("visible");
    document.getElementById("addForm").reset();
}

// ===== 编辑弹窗 =====

function openEditModal(id) {
    const items = getItems();
    const item = items.find(i => i.id === id);
    if (!item) return;

    editingItemId = id;
    document.getElementById("editItemName").value = item.name;
    document.getElementById("editItemCategory").value = item.category;
    document.getElementById("editItemExpiry").value = item.expiryDate;
    document.getElementById("editItemQuantity").value = item.quantity;
    document.getElementById("editItemUnit").value = item.unit;
    document.getElementById("editModal").classList.add("visible");
}

function closeEditModal() {
    document.getElementById("editModal").classList.remove("visible");
    editingItemId = null;
}

function deleteItemFromEdit() {
    if (!editingItemId) return;
    const items = getItems();
    const item = items.find(i => i.id === editingItemId);
    if (item && confirm(`确定要删除 "${item.name}" 吗？`)) {
        saveItems(items.filter(i => i.id !== editingItemId));
        closeEditModal();
        renderItems();
        showToast("已删除");
    }
}

// ===== 初始化 =====

document.addEventListener("DOMContentLoaded", () => {
    renderItems();

    // 添加表单提交
    document.getElementById("addForm").onsubmit = (e) => {
        e.preventDefault();
        const name = document.getElementById("itemName").value.trim();
        const unit = document.getElementById("itemUnit").value.trim();
        if (!name || !unit) {
            showToast("请填写完整信息");
            return;
        }
        const items = getItems();
        items.push({
            id: generateId(),
            name: name,
            category: document.getElementById("itemCategory").value,
            expiryDate: document.getElementById("itemExpiry").value,
            quantity: parseInt(document.getElementById("itemQuantity").value),
            unit: unit
        });
        saveItems(items);
        closeModal();
        renderItems();
        showToast("已添加");
    };

    // 编辑表单提交
    document.getElementById("editForm").onsubmit = (e) => {
        e.preventDefault();
        if (!editingItemId) return;
        const name = document.getElementById("editItemName").value.trim();
        const unit = document.getElementById("editItemUnit").value.trim();
        if (!name || !unit) {
            showToast("请填写完整信息");
            return;
        }
        const items = getItems();
        const idx = items.findIndex(i => i.id === editingItemId);
        if (idx !== -1) {
            items[idx] = {
                ...items[idx],
                name: name,
                category: document.getElementById("editItemCategory").value,
                expiryDate: document.getElementById("editItemExpiry").value,
                quantity: parseInt(document.getElementById("editItemQuantity").value),
                unit: unit
            };
            saveItems(items);
            closeEditModal();
            renderItems();
            showToast("已保存");
        }
    };

    // 点击弹窗背景关闭
    document.querySelectorAll(".modal-backdrop").forEach(backdrop => {
        backdrop.addEventListener("click", () => {
            closeModal();
            closeEditModal();
        });
    });

    // 胶囊导航
    const categoryBtn = document.getElementById("categoryBtn");
    const capsule = document.getElementById("capsule");

    categoryBtn.onclick = () => {
        navExpanded = !navExpanded;
        capsule.classList.toggle("expand", navExpanded);
        if (!navExpanded) {
            currentCategory = "all";
            document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
            categoryBtn.classList.add("active");
            renderItems();
        }
    };

    document.querySelectorAll(".extra-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            currentCategory = btn.dataset.category;
            navExpanded = false;
            capsule.classList.remove("expand");
            renderItems();
        });
    });

    // 点击页面其他区域收起导航
    document.addEventListener("click", (e) => {
        if (navExpanded && !capsule.contains(e.target)) {
            navExpanded = false;
            capsule.classList.remove("expand");
        }
    });

    lucide.createIcons();
});
