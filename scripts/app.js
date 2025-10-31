(() => {
    const STORAGE_KEY = "campusCanteen.items.v1";
    const CART_KEY = "campusCanteen.cart.v1";
    const MAX_SIGNALS = 5;

    const dom = {
        itemGrid: document.querySelector("[data-item-grid]"),
        searchInput: document.querySelector("[data-filter-search]"),
        categorySelect: document.querySelector("[data-filter-category]"),
        sortSelect: document.querySelector("[data-filter-sort]"),
        vegCheckbox: document.querySelector("[data-filter-veg]"),
        maxPriceInput: document.querySelector("[data-filter-max-price]"),
        resetButton: document.querySelector('[data-action="reset-filters"]'),
        statItems: document.querySelector("[data-stat-items]"),
        statChange: document.querySelector("[data-stat-change]"),
        statUpdated: document.querySelector("[data-stat-updated]"),
        selectedChip: document.querySelector("[data-selected-chip]"),
        selectedContainer: document.querySelector("[data-selected-item]"),
        cartContainer: document.querySelector("[data-cart-container]"),
        cartChip: document.querySelector("[data-cart-chip]"),
        signalList: document.querySelector("[data-signal-list]")
    };

    const savedItems = loadItems();

    const state = {
        items: normalizeItems(savedItems || createDefaultItems()),
        filteredItems: [],
        selectedItemId: null,
        filters: {
            search: "",
            category: "all",
            sortBy: "updated-desc",
            vegOnly: false,
            maxPrice: null
        },
        cart: loadCart(),
        signals: []
    };

    const currencyFormatter = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
    const dateTimeFormatter = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" });
    const dateFormatter = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" });
    const relativeFormatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

    if (!savedItems) {
        saveItems();
    }

    init();

    function init() {
        populateCategoryFilter();
        hydrateMaxPriceFilter();
        bindEvents();
        applyFilters();
        ensureSelection();
        updateSignals();
        renderAll();
    }

    function bindEvents() {
        if (dom.searchInput) {
            dom.searchInput.addEventListener("input", (event) => {
                state.filters.search = event.target.value.trim();
                applyFilters();
                ensureSelection();
                renderAll();
            });
        }

        if (dom.categorySelect) {
            dom.categorySelect.addEventListener("change", (event) => {
                state.filters.category = event.target.value;
                applyFilters();
                ensureSelection();
                renderAll();
            });
        }

        if (dom.sortSelect) {
            dom.sortSelect.addEventListener("change", (event) => {
                state.filters.sortBy = event.target.value;
                applyFilters();
                renderAll();
            });
        }

        if (dom.vegCheckbox) {
            dom.vegCheckbox.addEventListener("change", (event) => {
                state.filters.vegOnly = event.target.checked;
                applyFilters();
                ensureSelection();
                renderAll();
            });
        }

        if (dom.maxPriceInput) {
            dom.maxPriceInput.addEventListener("input", (event) => {
                const value = Number(event.target.value);
                state.filters.maxPrice = Number.isFinite(value) && value > 0 ? value : null;
                applyFilters();
                ensureSelection();
                renderAll();
            });
        }

        if (dom.resetButton) {
            dom.resetButton.addEventListener("click", () => {
                resetFilters();
                applyFilters();
                ensureSelection();
                renderAll();
            });
        }

        if (dom.itemGrid) {
            dom.itemGrid.addEventListener("click", (event) => {
                const button = event.target.closest("[data-action]");
                if (!button) {
                    const card = event.target.closest(".item-card");
                    if (card?.dataset?.itemId) {
                        selectItem(card.dataset.itemId);
                        renderAll();
                    }
                    return;
                }

                const { action, id } = button.dataset;
                if (!id) {
                    return;
                }

                if (action === "select-item") {
                    selectItem(id);
                    renderAll();
                }

                if (action === "add-to-cart") {
                    addToCart(id);
                    renderCart();
                }
            });
        }

        if (dom.selectedContainer) {
            dom.selectedContainer.addEventListener("submit", (event) => {
                if (event.target.matches("[data-price-form]")) {
                    event.preventDefault();
                    const form = event.target;
                    const priceInput = form.querySelector("[data-price-input]");
                    const noteInput = form.querySelector("[data-note-input]");
                    const priceValue = Number(priceInput?.value);
                    if (!Number.isFinite(priceValue) || priceValue <= 0) {
                        priceInput?.focus();
                        return;
                    }
                    const noteValue = noteInput?.value.trim() || "";
                    recordPrice(priceValue, noteValue);
                    form.reset();
                    renderAll();
                }
            });

            dom.selectedContainer.addEventListener("click", (event) => {
                const button = event.target.closest("[data-action]");
                if (!button) {
                    return;
                }
                if (button.dataset.action === "add-to-cart-selected") {
                    const selected = getSelectedItem();
                    if (selected) {
                        addToCart(selected.id);
                        renderCart();
                    }
                }
            });
        }

        if (dom.cartContainer) {
            dom.cartContainer.addEventListener("click", (event) => {
                const button = event.target.closest("[data-action]");
                if (!button) {
                    return;
                }
                const { action, id } = button.dataset;
                if (!id) {
                    if (action === "checkout") {
                        handleCheckout();
                    }
                    return;
                }

                if (action === "increase") {
                    updateCartQuantity(id, 1);
                }
                if (action === "decrease") {
                    updateCartQuantity(id, -1);
                }
                if (action === "remove") {
                    removeFromCart(id);
                }
                renderCart();
            });
        }

        window.addEventListener("storage", (event) => {
            if (event.key === STORAGE_KEY) {
                state.items = normalizeItems(loadItems());
                applyFilters();
                ensureSelection();
                updateSignals();
                renderAll();
            }
            if (event.key === CART_KEY) {
                state.cart = loadCart();
                renderCart();
            }
        });
    }

    function resetFilters() {
        state.filters = {
            search: "",
            category: "all",
            sortBy: "updated-desc",
            vegOnly: false,
            maxPrice: null
        };
        if (dom.searchInput) dom.searchInput.value = "";
        if (dom.categorySelect) dom.categorySelect.value = "all";
        if (dom.sortSelect) dom.sortSelect.value = "updated-desc";
        if (dom.vegCheckbox) dom.vegCheckbox.checked = false;
        if (dom.maxPriceInput) dom.maxPriceInput.value = "";
    }

    function applyFilters() {
        const items = state.items.slice();
        const { search, category, vegOnly, maxPrice, sortBy } = state.filters;

        const normalizedSearch = search.toLowerCase();

        const filtered = items.filter((item) => {
            const currentPrice = getCurrentPrice(item);
            if (vegOnly && !item.isVeg) {
                return false;
            }
            if (category !== "all" && item.category !== category) {
                return false;
            }
            if (maxPrice !== null && currentPrice > maxPrice) {
                return false;
            }
            if (normalizedSearch) {
                const haystack = [item.name, item.category, ...(item.tags || [])].join(" ").toLowerCase();
                if (!haystack.includes(normalizedSearch)) {
                    return false;
                }
            }
            return true;
        });

        const sorters = {
            "updated-desc": (a, b) => new Date(getLatestEntry(b).date) - new Date(getLatestEntry(a).date),
            "price-asc": (a, b) => getCurrentPrice(a) - getCurrentPrice(b),
            "price-desc": (a, b) => getCurrentPrice(b) - getCurrentPrice(a),
            "name-asc": (a, b) => a.name.localeCompare(b.name)
        };

        filtered.sort(sorters[sortBy] || sorters["updated-desc"]);

        state.filteredItems = filtered;
    }

    function renderAll() {
        renderCatalog();
        renderSelectedItem();
        renderStats();
        renderCart();
        renderSignals();
    }

    function renderCatalog() {
        if (!dom.itemGrid) {
            return;
        }

        dom.itemGrid.innerHTML = "";

        if (!state.filteredItems.length) {
            dom.itemGrid.innerHTML = '<p class="empty-state">No items match your filters yet. Try tweaking the search criteria.</p>';
            return;
        }

        const fragment = document.createDocumentFragment();
        state.filteredItems.forEach((item) => {
            const card = document.createElement("article");
            card.className = "item-card";
            if (item.id === state.selectedItemId) {
                card.classList.add("item-card--active");
            }
            card.dataset.itemId = item.id;

            const latest = getLatestEntry(item) || { price: 0, date: null };
            const previous = item.priceHistory[1] || null;
            const delta = calcDelta(latest, previous);

            const tagsMarkup = (item.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("");

            card.innerHTML = `
                <header class="item-card__header">
                    <div class="item-card__avatar" style="background: ${getAvatarColor(item)}">${getInitials(item.name)}</div>
                    <div>
                        <h3 class="item-card__title">${escapeHtml(item.name)}</h3>
                        <p class="item-card__subtitle">${escapeHtml(item.category)}${item.isVeg ? " - Veg" : " - Non-veg"}</p>
                    </div>
                </header>
                <div class="item-card__meta">
                    <div class="price">
                        <span class="price__value">${formatCurrency(latest.price)}</span>
                        <span class="price__delta ${delta.className}">${delta.label}</span>
                    </div>
                    <span class="item-card__updated">${formatRelativeTime(latest.date)}</span>
                </div>
                <div class="item-card__tags">${tagsMarkup}</div>
                <div class="item-card__actions">
                    <button type="button" class="secondary" data-action="select-item" data-id="${item.id}">View history</button>
                    <button type="button" class="primary" data-action="add-to-cart" data-id="${item.id}">Add to tray</button>
                </div>
            `;

            fragment.appendChild(card);
        });

        dom.itemGrid.appendChild(fragment);
    }

    function renderSelectedItem() {
        const container = dom.selectedContainer;
        if (!container) {
            return;
        }

        const item = getSelectedItem();
        if (!item) {
            container.innerHTML = '<p class="empty-state">Select an item from the catalog to review its price history and record changes.</p>';
            if (dom.selectedChip) {
                dom.selectedChip.textContent = "Pick an item to view insights";
            }
            return;
        }

        const latest = getLatestEntry(item) || { price: 0, date: null };
        const previous = item.priceHistory[1] || null;
        const delta = calcDelta(latest, previous);

        if (dom.selectedChip) {
            dom.selectedChip.textContent = `${item.category} - ${item.isVeg ? "Vegetarian" : "Non-veg"}`;
        }

        const tagsMarkup = (item.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("");

        const historyItems = item.priceHistory.map((entry, index) => {
            const next = item.priceHistory[index + 1] || null;
            const entryDelta = calcDelta(entry, next);
            const directionClass = entryDelta.direction === "drop" ? "history-entry--drop" : entryDelta.direction === "surge" ? "history-entry--surge" : "";
            const noteMarkup = entry.note ? `<p class="history-entry__note">${escapeHtml(entry.note)}</p>` : "";
            return `
                <li class="history-entry ${directionClass}">
                    <div class="history-entry__headline">
                        <span class="history-entry__price">${formatCurrency(entry.price)}</span>
                        <span class="history-entry__delta ${entryDelta.className}">${entryDelta.label}</span>
                    </div>
                    <div class="history-entry__meta">
                        <span>Recorded on ${dateTimeFormatter.format(new Date(entry.date))}</span>
                        ${noteMarkup}
                    </div>
                </li>
            `;
        }).join("");

        const historyMarkup = historyItems
            ? `<ul class="history-list">${historyItems}</ul>`
            : '<p class="empty-state">No price history yet. Record the first update above.</p>';

        container.innerHTML = `
            <div class="selected-item__header">
                <div>
                    <h3>${escapeHtml(item.name)}</h3>
                    <p class="selected-item__desc">${escapeHtml(item.description || "")}</p>
                </div>
                <div class="selected-item__price">
                    <span class="price__value">${formatCurrency(latest.price)}</span>
                    <span class="price__delta ${delta.className}">${delta.label}</span>
                    <span class="item-card__updated">Updated ${formatRelativeTime(latest.date)}</span>
                </div>
            </div>
            <div class="selected-item__tags">${tagsMarkup}</div>
            <div class="selected-item__actions">
                <button type="button" class="primary" data-action="add-to-cart-selected">Add to tray</button>
                <form class="price-form" data-price-form>
                    <div class="price-form__row">
                        <label for="priceInput">Record a new price</label>
                        <input id="priceInput" name="price" type="number" min="1" step="0.5" required placeholder="e.g. 55" data-price-input>
                    </div>
                    <div class="price-form__row">
                        <label for="noteInput">Note (optional)</label>
                        <textarea id="noteInput" name="note" rows="3" placeholder="Why did the price change?" data-note-input></textarea>
                    </div>
                    <button type="submit" class="secondary">Save update</button>
                </form>
            </div>
            <section>
                <h4>Price history</h4>
                ${historyMarkup}
            </section>
        `;
    }

    function renderStats() {
        if (!dom.statItems || !dom.statChange || !dom.statUpdated) {
            return;
        }

        const totalItems = state.items.length;
        const deltas = state.items
            .map((item) => calcDelta(item.priceHistory[0], item.priceHistory[1] || null))
            .filter((delta) => delta.deltaAbsolute !== 0);

        const avgChange = deltas.length
            ? deltas.reduce((sum, delta) => sum + delta.deltaPercent, 0) / deltas.length
            : 0;

        const mostRecent = state.items
            .map((item) => getLatestEntry(item)?.date)
            .filter(Boolean)
            .sort((a, b) => new Date(b) - new Date(a))[0];

        dom.statItems.textContent = String(totalItems);
        dom.statChange.textContent = `${avgChange > 0 ? "+" : ""}${avgChange.toFixed(1)}%`;
        dom.statChange.className = `value ${avgChange > 0.1 ? "price__delta price__delta--up" : avgChange < -0.1 ? "price__delta price__delta--down" : "price__delta price__delta--flat"}`;
        dom.statUpdated.textContent = mostRecent ? formatRelativeTime(mostRecent) : "--";
    }

    function renderCart() {
        const container = dom.cartContainer;
        if (!container) {
            return;
        }

        const items = state.cart;
        if (!items.length) {
            container.innerHTML = '<p class="empty-state">Add snacks and meals to plan your next canteen run.</p>';
            if (dom.cartChip) {
                dom.cartChip.textContent = "Ready to checkout";
            }
            return;
        }

        const listItems = items.map((entry) => {
            const item = state.items.find((candidate) => candidate.id === entry.itemId);
            if (!item) {
                return "";
            }
            const latest = getLatestEntry(item) || { price: 0 };
            const lineTotal = latest.price * entry.quantity;
            return `
                <li class="cart-item">
                    <div class="cart-item__top">
                        <strong>${escapeHtml(item.name)}</strong>
                        <span class="cart-item__meta">${formatCurrency(latest.price)} x ${entry.quantity}</span>
                    </div>
                    <div class="cart-item__actions">
                        <button type="button" class="counter-button" data-action="decrease" data-id="${item.id}">-</button>
                        <span>${entry.quantity}</span>
                        <button type="button" class="counter-button" data-action="increase" data-id="${item.id}">+</button>
                        <button type="button" class="ghost" data-action="remove" data-id="${item.id}">Remove</button>
                        <span class="cart-item__meta">${formatCurrency(lineTotal)}</span>
                    </div>
                </li>
            `;
        }).join("");

        const subtotal = items.reduce((sum, entry) => {
            const item = state.items.find((candidate) => candidate.id === entry.itemId);
            if (!item) {
                return sum;
            }
            const latest = getLatestEntry(item) || { price: 0 };
            return sum + latest.price * entry.quantity;
        }, 0);
        const tax = subtotal * 0.05;
        const total = subtotal + tax;

        container.innerHTML = `
            <ul class="cart-list">${listItems}</ul>
            <div class="cart-summary">
                <div class="cart-summary__row">
                    <span>Subtotal</span>
                    <span>${formatCurrency(subtotal)}</span>
                </div>
                <div class="cart-summary__row">
                    <span>GST (5%)</span>
                    <span>${formatCurrency(tax)}</span>
                </div>
                <div class="cart-summary__total">
                    <span>Total</span>
                    <span>${formatCurrency(total)}</span>
                </div>
                <button type="button" class="primary" data-action="checkout">Confirm order</button>
            </div>
        `;

        if (dom.cartChip) {
            dom.cartChip.textContent = `${items.length} item${items.length > 1 ? "s" : ""} added`;
        }
    }

    function renderSignals() {
        const list = dom.signalList;
        if (!list) {
            return;
        }

        list.innerHTML = "";

        if (!state.signals.length) {
            list.innerHTML = '<li class="empty-state">Price drops and surges appear here as you add updates.</li>';
            return;
        }

        list.innerHTML = state.signals.map((signal) => {
            const directionClass = signal.direction === "drop" ? "signal-item--drop" : signal.direction === "surge" ? "signal-item--surge" : "";
            const label = signal.direction === "drop" ? "Price drop" : signal.direction === "surge" ? "Price surge" : "Stable";
            return `
                <li class="signal-item ${directionClass}">
                    <span class="signal-item__title">${escapeHtml(signal.name)}</span>
                    <span>${label}: ${signal.deltaLabel}</span>
                    <div class="signal-item__meta">
                        <span>${dateFormatter.format(new Date(signal.date))}</span>
                        <span>${formatRelativeTime(signal.date)}</span>
                    </div>
                </li>
            `;
        }).join("");
    }

    function populateCategoryFilter() {
        if (!dom.categorySelect) {
            return;
        }

        const categories = Array.from(new Set(state.items.map((item) => item.category))).sort();
        const fragment = document.createDocumentFragment();
        categories.forEach((category) => {
            const option = document.createElement("option");
            option.value = category;
            option.textContent = category;
            fragment.appendChild(option);
        });
        dom.categorySelect.appendChild(fragment);
    }

    function hydrateMaxPriceFilter() {
        if (!dom.maxPriceInput) {
            return;
        }
        const maxPrice = Math.ceil(Math.max(...state.items.map((item) => getCurrentPrice(item))));
        if (Number.isFinite(maxPrice)) {
            dom.maxPriceInput.placeholder = `Up to ${maxPrice}`;
        }
    }

    function ensureSelection() {
        if (!state.filteredItems.length) {
            state.selectedItemId = null;
            return;
        }
        if (state.selectedItemId && state.filteredItems.some((item) => item.id === state.selectedItemId)) {
            return;
        }
        state.selectedItemId = state.filteredItems[0].id;
    }

    function selectItem(itemId) {
        if (!itemId) {
            return;
        }
        state.selectedItemId = itemId;
    }

    function recordPrice(price, note) {
        const item = getSelectedItem();
        if (!item) {
            return;
        }

        const newEntry = {
            price: Number(price),
            note,
            date: new Date().toISOString()
        };

        item.priceHistory.unshift(newEntry);
        item.priceHistory.sort((a, b) => new Date(b.date) - new Date(a.date));

        state.items = state.items.map((candidate) => (candidate.id === item.id ? item : candidate));
        saveItems();
        applyFilters();
        updateSignals();
    }

    function addToCart(itemId) {
        const existing = state.cart.find((entry) => entry.itemId === itemId);
        if (existing) {
            existing.quantity += 1;
        } else {
            state.cart.push({ itemId, quantity: 1 });
        }
        saveCart();
    }

    function updateCartQuantity(itemId, delta) {
        const entry = state.cart.find((candidate) => candidate.itemId === itemId);
        if (!entry) {
            return;
        }
        entry.quantity += delta;
        if (entry.quantity <= 0) {
            state.cart = state.cart.filter((candidate) => candidate.itemId !== itemId);
        }
        saveCart();
    }

    function removeFromCart(itemId) {
        state.cart = state.cart.filter((candidate) => candidate.itemId !== itemId);
        saveCart();
    }

    function handleCheckout() {
        if (!state.cart.length) {
            return;
        }
        const totalItems = state.cart.reduce((sum, entry) => sum + entry.quantity, 0);
        alert(`Order placed! ${totalItems} item${totalItems > 1 ? "s" : ""} reserved at the current prices.`);
        state.cart = [];
        saveCart();
        renderCart();
    }

    function updateSignals() {
        const signals = state.items
            .map((item) => {
                const latest = getLatestEntry(item);
                const previous = item.priceHistory[1];
                if (!latest || !previous) {
                    return null;
                }
                const delta = calcDelta(latest, previous);
                if (Math.abs(delta.deltaPercent) < 2 && Math.abs(delta.deltaAbsolute) < 2) {
                    return null;
                }
                return {
                    id: item.id,
                    name: item.name,
                    direction: delta.direction,
                    deltaLabel: delta.label,
                    deltaPercent: delta.deltaPercent,
                    deltaAbsolute: delta.deltaAbsolute,
                    date: latest.date
                };
            })
            .filter(Boolean)
            .sort((a, b) => Math.abs(b.deltaPercent) - Math.abs(a.deltaPercent))
            .slice(0, MAX_SIGNALS);

        state.signals = signals;
    }

    function getSelectedItem() {
        return state.items.find((item) => item.id === state.selectedItemId) || null;
    }

    function loadItems() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) {
                return null;
            }
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : null;
        } catch (error) {
            console.warn("Unable to load saved items", error);
            return null;
        }
    }

    function saveItems() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items));
    }

    function loadCart() {
        try {
            const raw = localStorage.getItem(CART_KEY);
            if (!raw) {
                return [];
            }
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) {
                return [];
            }
            return parsed
                .filter((entry) => entry && typeof entry.itemId === "string" && Number.isFinite(Number(entry.quantity)))
                .map((entry) => ({ itemId: entry.itemId, quantity: Math.max(1, Math.round(entry.quantity)) }));
        } catch (error) {
            console.warn("Unable to load cart", error);
            return [];
        }
    }

    function saveCart() {
        localStorage.setItem(CART_KEY, JSON.stringify(state.cart));
    }

    function createDefaultItems() {
        const now = new Date();
        const daysAgo = (days) => {
            const date = new Date(now);
            date.setDate(date.getDate() - days);
            date.setHours(9, 0, 0, 0);
            return date.toISOString();
        };

        return [
            {
                id: "masala-dosa",
                name: "Masala Dosa",
                category: "Breakfast",
                description: "Crispy dosa with spiced potato mash and coconut chutney.",
                tags: ["South Indian", "Combo friendly"],
                isVeg: true,
                priceHistory: [
                    { price: 48, date: daysAgo(1), note: "Vendor revision due to ingredient cost." },
                    { price: 45, date: daysAgo(12), note: "Reintroduced post mid-term break." },
                    { price: 42, date: daysAgo(28), note: "Festive discount week." }
                ]
            },
            {
                id: "paneer-wrap",
                name: "Paneer Tikka Wrap",
                category: "Lunch",
                description: "Soft wrap stuffed with grilled paneer, veggies, and mint mayo.",
                tags: ["High protein", "Student favorite"],
                isVeg: true,
                priceHistory: [
                    { price: 62, date: daysAgo(4), note: "Added cheese slice upgrade." },
                    { price: 58, date: daysAgo(16), note: "Back-to-campus promo." },
                    { price: 55, date: daysAgo(33), note: "Launch week pricing." }
                ]
            },
            {
                id: "chicken-biryani",
                name: "Chicken Biryani",
                category: "Lunch",
                description: "Classic Hyderabadi style biryani with raita.",
                tags: ["Non-veg", "Hearty meal"],
                isVeg: false,
                priceHistory: [
                    { price: 90, date: daysAgo(2), note: "Chicken supplier cost adjustment." },
                    { price: 85, date: daysAgo(15), note: "Hostel night demand spike." },
                    { price: 82, date: daysAgo(31), note: "Introductory combo price." }
                ]
            },
            {
                id: "veg-puff",
                name: "Veg Puff",
                category: "Snacks",
                description: "Flaky pastry with spicy vegetable filling, best with chai.",
                tags: ["Evening", "Quick bite"],
                isVeg: true,
                priceHistory: [
                    { price: 24, date: daysAgo(3), note: "Pastry sheet bulk pricing secured." },
                    { price: 26, date: daysAgo(14), note: "Butter price hike." },
                    { price: 22, date: daysAgo(25), note: "Freshers' week discount." }
                ]
            },
            {
                id: "cold-coffee",
                name: "Cold Coffee",
                category: "Beverages",
                description: "Chilled coffee with vanilla ice cream scoop.",
                tags: ["Summer", "Caffeine boost"],
                isVeg: true,
                priceHistory: [
                    { price: 55, date: daysAgo(6), note: "Seasonal offer ended." },
                    { price: 50, date: daysAgo(18), note: "Sponsor-led discount." },
                    { price: 58, date: daysAgo(36), note: "Exam week demand bump." }
                ]
            },
            {
                id: "fruit-salad",
                name: "Fruit Salad Cup",
                category: "Desserts",
                description: "Mixed seasonal fruits with honey drizzle.",
                tags: ["Healthy", "Gluten free"],
                isVeg: true,
                priceHistory: [
                    { price: 38, date: daysAgo(1), note: "Added dragon fruit topping." },
                    { price: 34, date: daysAgo(11), note: "Local farm tie-up pricing." },
                    { price: 36, date: daysAgo(21), note: "Inventory refresh." }
                ]
            },
            {
                id: "samosa",
                name: "Punjabi Samosa",
                category: "Snacks",
                description: "Crispy samosa with tangy tamarind chutney.",
                tags: ["Tea time", "Budget pick"],
                isVeg: true,
                priceHistory: [
                    { price: 18, date: daysAgo(5), note: "Oil price normalized." },
                    { price: 16, date: daysAgo(17), note: "Bulk order subsidy." },
                    { price: 20, date: daysAgo(30), note: "Potato shortage week." }
                ]
            }
        ];
    }

    function normalizeItems(items) {
        if (!Array.isArray(items)) {
            return [];
        }
        return items.map((item) => ({
            id: item.id,
            name: item.name,
            category: item.category,
            description: item.description || "",
            tags: Array.isArray(item.tags) ? item.tags : [],
            isVeg: Boolean(item.isVeg),
            priceHistory: Array.isArray(item.priceHistory)
                ? item.priceHistory
                      .filter((entry) => Number.isFinite(Number(entry?.price)) && entry?.date)
                      .map((entry) => ({
                          price: Number(entry.price),
                          date: entry.date,
                          note: entry.note || ""
                      }))
                      .sort((a, b) => new Date(b.date) - new Date(a.date))
                : []
        }));
    }

    function getCurrentPrice(item) {
        const latest = getLatestEntry(item);
        return latest ? latest.price : 0;
    }

    function getLatestEntry(item) {
        return item?.priceHistory?.[0] || null;
    }

    function calcDelta(current, previous) {
        if (!current) {
            return {
                label: "No data",
                className: "price__delta price__delta--flat",
                direction: "flat",
                deltaPercent: 0,
                deltaAbsolute: 0
            };
        }

        if (!previous) {
            return {
                label: "New entry",
                className: "price__delta price__delta--flat",
                direction: "flat",
                deltaPercent: 0,
                deltaAbsolute: 0
            };
        }

        const deltaAbsolute = Number((current.price - previous.price).toFixed(2));
        const deltaPercent = previous.price === 0 ? 0 : Number(((deltaAbsolute / previous.price) * 100).toFixed(2));
        let className = "price__delta price__delta--flat";
        let direction = "flat";
        let label = "No change";

        if (deltaAbsolute > 0.05) {
            className = "price__delta price__delta--up";
            direction = "surge";
            label = `+${formatCurrency(deltaAbsolute)} (${deltaPercent > 0 ? "+" : ""}${deltaPercent.toFixed(1)}%)`;
        } else if (deltaAbsolute < -0.05) {
            className = "price__delta price__delta--down";
            direction = "drop";
            label = `${formatCurrency(deltaAbsolute)} (${deltaPercent.toFixed(1)}%)`;
        }

        if (direction === "flat") {
            label = "Stable";
        }

        return { className, direction, label, deltaAbsolute, deltaPercent };
    }

    function formatCurrency(value) {
        return currencyFormatter.format(Number(value || 0));
    }

    function formatRelativeTime(dateLike) {
        if (!dateLike) {
            return "--";
        }
        const date = new Date(dateLike);
        if (Number.isNaN(date.getTime())) {
            return "--";
        }
        const diffMs = date.getTime() - Date.now();
        const diffMinutes = Math.round(diffMs / 60000);
        const diffHours = Math.round(diffMinutes / 60);
        const diffDays = Math.round(diffHours / 24);

        if (Math.abs(diffMinutes) < 60) {
            return relativeFormatter.format(diffMinutes, "minute");
        }
        if (Math.abs(diffHours) < 48) {
            return relativeFormatter.format(diffHours, "hour");
        }
        if (Math.abs(diffDays) < 14) {
            return relativeFormatter.format(diffDays, "day");
        }
        return dateFormatter.format(date);
    }

    function getInitials(name) {
        return name
            .split(/\s+/)
            .map((part) => part[0] || "")
            .join("")
            .slice(0, 2)
            .toUpperCase();
    }

    function getAvatarColor(item) {
        const palette = [
            "linear-gradient(135deg, #2563eb, #60a5fa)",
            "linear-gradient(135deg, #22c55e, #4ade80)",
            "linear-gradient(135deg, #ec4899, #f472b6)",
            "linear-gradient(135deg, #f97316, #fb923c)",
            "linear-gradient(135deg, #14b8a6, #2dd4bf)",
            "linear-gradient(135deg, #8b5cf6, #a855f7)"
        ];
        const hash = item.id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
        return palette[hash % palette.length];
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }
})();
