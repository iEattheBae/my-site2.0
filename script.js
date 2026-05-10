const STORAGE_KEY = "inventory_items_v2";
let currentCategory = "all";
let currentSearch = "";
let navExpanded = false;
let editingItemId = null;
let toastTimer = null;
let currentView = "grid";
let swipeState = null;
const SWIPE_THRESHOLD = 0.4;

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

// ===== 卡片创建 =====

function createItemCard(item) {
    const status = getExpiryStatus(item.expiryDate);
    const card = document.createElement("div");
    card.className = "item-card";
    card.dataset.id = item.id;
    card.dataset.category = item.category;

    if (status.isExpired || status.isExpiring) {
        card.classList.add("warning-border");
    }

    const left = document.createElement("div");
    const nameEl = document.createElement("div");
    nameEl.className = "item-name";
    nameEl.textContent = item.name;
    const catEl = document.createElement("div");
    catEl.className = "item-category";
    catEl.textContent = categoryNames[item.category] || "未分类";
    left.appendChild(nameEl);
    left.appendChild(catEl);

    const right = document.createElement("div");
    right.style.display = "flex";
    right.style.flexDirection = "column";
    right.style.alignItems = "flex-end";

    const qtyEl = document.createElement("div");
    qtyEl.className = "item-quantity";
    qtyEl.textContent = item.quantity;
    const unitSpan = document.createElement("span");
    unitSpan.className = "item-unit";
    unitSpan.textContent = item.unit;
    qtyEl.appendChild(unitSpan);
    right.appendChild(qtyEl);

    if (status.isExpired) {
        const badge = document.createElement("div");
        badge.className = "expire-badge expired";
        badge.textContent = "已过期";
        right.appendChild(badge);
    } else if (status.isExpiring) {
        const badge = document.createElement("div");
        badge.className = "expire-badge expiring";
        badge.textContent = "即将过期";
        right.appendChild(badge);
    }

    const footer = document.createElement("div");
    footer.className = "items-footer";
    footer.textContent = `有效期至: ${item.expiryDate || "未设置"}`;
    right.appendChild(footer);

    card.appendChild(left);
    card.appendChild(right);

    card.addEventListener("click", (e) => {
        if (card.dataset.swiping === "true") return;
        openEditModal(item.id);
    });

    return card;
}

// ===== 渲染列表 =====

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
    const existingCards = container.querySelectorAll(".item-card");
    const existingIds = new Set();
    existingCards.forEach(c => existingIds.add(c.dataset.id));
    const newIds = new Set(items.map(i => String(i.id)));

    existingCards.forEach(card => {
        if (!newIds.has(card.dataset.id)) {
            card.classList.add("removing");
            card.addEventListener("animationend", () => card.remove(), { once: true });
        }
    });

    if (items.length === 0) {
        container.innerHTML = "";
        container.appendChild(createEmptyState());
        const clearBtn = document.getElementById("clearSearch");
        if (clearBtn) clearBtn.classList.remove("visible");
        lucide.createIcons();
        return;
    }

    const emptyState = document.getElementById("emptyState");
    if (emptyState) emptyState.remove();

    const fragment = document.createDocumentFragment();
    items.forEach((item, index) => {
        const idStr = String(item.id);
        if (existingIds.has(idStr)) {
            const existingCard = container.querySelector(`.item-card[data-id="${CSS.escape(idStr)}"]`);
            if (existingCard) {
                existingCard.style.animation = "none";
                existingCard.offsetHeight;
                existingCard.style.animation = "cardIn 0.55s var(--spring) backwards";
                existingCard.style.animationDelay = `${index * 0.04}s`;
                fragment.appendChild(existingCard);
            }
        } else {
            const card = createItemCard(item);
            card.style.animationDelay = `${index * 0.04}s`;
            fragment.appendChild(card);
        }
    });

    container.innerHTML = "";
    container.appendChild(fragment);
    setupSwipeGestures();
    lucide.createIcons();

    const clearBtn = document.getElementById("clearSearch");
    if (clearBtn) clearBtn.classList.toggle("visible", currentSearch.trim().length > 0);
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

// ===== 滑动手势 =====

function setupSwipeGestures() {
    document.querySelectorAll(".item-card").forEach(card => {
        if (card.dataset.swipeReady === "true") return;
        card.dataset.swipeReady = "true";

        card.addEventListener("touchstart", onSwipeStart, { passive: false });
        card.addEventListener("touchmove", onSwipeMove, { passive: false });
        card.addEventListener("touchend", onSwipeEnd);
    });
}

function onSwipeStart(e) {
    const card = e.currentTarget;
    if (e.target.closest("button")) return;

    const touch = e.touches[0];
    swipeState = {
        card: card,
        startX: touch.clientX,
        startY: touch.clientY,
        currentX: touch.clientX,
        startTime: Date.now(),
        locked: null
    };
}

function onSwipeMove(e) {
    if (!swipeState) return;
    const touch = e.touches[0];
    const dx = touch.clientX - swipeState.startX;
    const dy = touch.clientY - swipeState.startY;

    if (swipeState.locked === null) {
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 5) {
            swipeState.locked = 'h';
        } else if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 5) {
            swipeState.locked = 'v';
        }
    }

    if (swipeState.locked === 'v') return;

    if (swipeState.locked === 'h') {
        e.preventDefault();
        swipeState.currentX = touch.clientX;
        const deltaX = touch.clientX - swipeState.startX;
        const maxTranslate = swipeState.card.offsetWidth * 0.8;
        const damped = dampen(deltaX, maxTranslate);
        const rotation = (damped / swipeState.card.offsetWidth) * 4;

        swipeState.card.style.transform = `translateX(${damped}px) rotate(${rotation}deg)`;
        swipeState.card.classList.add("swiping");
        swipeState.card.dataset.swiping = "true";

        updateSwipeIndicator(swipeState.card, damped);
    }
}

function onSwipeEnd(e) {
    if (!swipeState || swipeState.locked !== 'h') {
        swipeState = null;
        return;
    }

    const card = swipeState.card;
    const deltaX = swipeState.currentX - swipeState.startX;
    const threshold = card.offsetWidth * SWIPE_THRESHOLD;

    card.classList.remove("swiping");
    card.classList.add("spring-back");
    card.dataset.swiping = "false";

    if (Math.abs(deltaX) > threshold) {
        if (deltaX > 0) {
            const id = card.dataset.id;
            card.style.transform = `translateX(${card.offsetWidth}px) rotate(8deg)`;
            card.style.opacity = "0";
            card.style.transition = "transform 0.3s ease-out, opacity 0.3s ease-out";
            card.addEventListener("transitionend", () => {
                card.style.transform = "";
                card.style.opacity = "";
                card.style.transition = "";
                openEditModal(id);
            }, { once: true });
        } else {
            card.style.transform = `translateX(-${card.offsetWidth}px) rotate(-8deg)`;
            card.style.opacity = "0";
            card.style.transition = "transform 0.3s ease-out, opacity 0.3s ease-out";
            card.addEventListener("transitionend", () => {
                const id = card.dataset.id;
                const items = getItems();
                const item = items.find(i => i.id === id);
                if (item) {
                    saveItems(items.filter(i => i.id !== id));
                    renderItems();
                    showToast("已删除 " + item.name);
                }
            }, { once: true });
        }
    } else {
        card.style.transform = "translateX(0) rotate(0deg)";
        clearSwipeIndicator(card);
        card.addEventListener("transitionend", () => {
            card.classList.remove("spring-back");
        }, { once: true });
    }

    swipeState = null;
}

function dampen(value, max) {
    if (Math.abs(value) <= max * 0.5) return value;
    const sign = value > 0 ? 1 : -1;
    return sign * (max * 0.5 + (max * 0.5) * (1 - Math.exp(-(Math.abs(value) - max * 0.5) / (max * 0.3))));
}

function updateSwipeIndicator(card, deltaX) {
    clearSwipeIndicator(card);
    let indicator = card.querySelector(".swipe-indicator");
    if (!indicator) {
        indicator = document.createElement("div");
        indicator.className = "swipe-indicator";
        card.appendChild(indicator);
    }
    const abs = Math.abs(deltaX);
    const threshold = card.offsetWidth * SWIPE_THRESHOLD;
    indicator.style.opacity = Math.min(abs / (threshold * 0.6), 0.9);

    if (deltaX > 0) {
        indicator.textContent = "编辑";
        indicator.style.right = "auto";
        indicator.style.left = "16px";
        indicator.style.background = "rgba(59, 130, 246, 0.85)";
    } else {
        indicator.textContent = "删除";
        indicator.style.left = "auto";
        indicator.style.right = "16px";
        indicator.style.background = "rgba(255, 69, 58, 0.85)";
    }
}

function clearSwipeIndicator(card) {
    const indicator = card.querySelector(".swipe-indicator");
    if (indicator) indicator.remove();
}

// ===== 视图切换 (FLIP) =====

function toggleView() {
    const container = document.getElementById("itemsContainer");
    const btn = document.getElementById("viewToggle");
    const icon = btn.querySelector("i");

    const cards = Array.from(container.querySelectorAll(".item-card"));
    const firstRects = cards.map(c => c.getBoundingClientRect());

    currentView = currentView === "grid" ? "list" : "grid";
    container.dataset.view = currentView;

    if (currentView === "list") {
        icon.setAttribute("data-lucide", "layout-list");
    } else {
        icon.setAttribute("data-lucide", "layout-grid");
    }
    lucide.createIcons();

    const lastRects = cards.map(c => c.getBoundingClientRect());

    cards.forEach((card, i) => {
        const first = firstRects[i];
        const last = lastRects[i];
        const dx = first.left - last.left;
        const dy = first.top - last.top;

        card.style.transition = "none";
        card.style.transform = `translate(${dx}px, ${dy}px)`;

        requestAnimationFrame(() => {
            card.style.transition = "transform 0.45s cubic-bezier(0.22, 0.61, 0.36, 1)";
            card.style.transform = "translate(0, 0)";
        });
    });
}

// ===== 涟漪 =====

function createRipple(e) {
    const btn = e.currentTarget;
    const ripple = document.createElement("span");
    ripple.className = "ripple";

    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
    ripple.style.top = `${e.clientY - rect.top - size / 2}px`;

    btn.appendChild(ripple);
    ripple.addEventListener("animationend", () => ripple.remove());
}

// ===== 滚动联动 =====

function handleScroll() {
    const header = document.querySelector(".ios-header");
    const scrollY = window.scrollY;

    if (scrollY > 10) {
        header.classList.add("scrolled");
    } else {
        header.classList.remove("scrolled");
    }

    document.querySelectorAll(".item-card").forEach(card => {
        if (card.style.transform && card.style.transform.includes("translateX")) return;
        const rect = card.getBoundingClientRect();
        const viewCenter = window.innerHeight / 2;
        const cardCenter = rect.top + rect.height / 2;
        const distFromCenter = (cardCenter - viewCenter) / viewCenter;

        if (Math.abs(distFromCenter) < 0.6) {
            const scale = 1 - Math.abs(distFromCenter) * 0.06;
            const opacity = 1 - Math.abs(distFromCenter) * 0.3;
            card.style.transform = `scale(${scale})`;
            card.style.opacity = opacity;
        } else {
            card.style.transform = "";
            card.style.opacity = "";
        }
    });
}

// ===== 弹窗 =====

function openAddModal() {
    document.getElementById("addModal").classList.add("visible");
    document.getElementById("addForm").reset();
    document.getElementById("itemQuantity").value = "1";
    setTimeout(() => document.getElementById("itemName").focus(), 100);
}

function closeModal() {
    document.getElementById("addModal").classList.remove("visible");
    document.getElementById("addForm").reset();
}

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

    window.addEventListener("scroll", handleScroll, { passive: true });

    // 添加表单
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

    // 编辑表单
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

    // 弹窗背景点击关闭
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

    document.addEventListener("click", (e) => {
        if (navExpanded && !capsule.contains(e.target)) {
            navExpanded = false;
            capsule.classList.remove("expand");
        }
    });

    // 涟漪
    document.querySelectorAll("button").forEach(btn => {
        btn.addEventListener("click", createRipple);
    });

    lucide.createIcons();
});
