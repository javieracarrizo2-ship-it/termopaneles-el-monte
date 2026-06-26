/**
 * App.js - Catalog controller for Termopaneles Fijos
 * Fetches, parses, filters, sorts and displays products from CSV
 */

// Configuration
const CONFIG = {
    csvPath: 'inventario-termopaneles-landing.csv',
    googleSheetUrl: '', // Pega aquí el enlace de Google Sheets publicado como CSV
    whatsappNumber: '56977445451', // Chilean business WhatsApp number (+56 9 ...)
    lowStockThreshold: 5
};

// Application State
let appState = {
    products: [],
    filteredProducts: [],
    activeCategory: 'all',
    searchQuery: '',
    sortBy: 'dimensions-similar',
    cart: [],
    maxCatalogWidth: 120,
    maxCatalogHeight: 220
};

// DOM Elements
const DOM = {
    productsGrid: document.getElementById('products-grid'),
    loader: document.getElementById('inventory-loader'),
    categoryTabs: document.getElementById('category-tabs'),
    searchInput: document.getElementById('search-input'),
    sortSelect: document.getElementById('sort-select'),
    resultsCount: document.getElementById('results-count'),
    activeFiltersInfo: document.getElementById('active-filters-info'),
    // Cart Elements
    cartDrawer: document.getElementById('cart-drawer'),
    cartToggle: document.getElementById('cart-toggle-btn'),
    cartClose: document.getElementById('cart-close-btn'),
    cartOverlay: document.getElementById('cart-drawer-overlay'),
    cartItemsList: document.getElementById('cart-items-list'),
    cartEmptyState: document.getElementById('cart-empty-state'),
    cartTotalUnits: document.getElementById('cart-total-units'),
    cartUnitPrice: document.getElementById('cart-unit-price'),
    cartTotalPrice: document.getElementById('cart-total-price'),
    cartDiscountMessage: document.getElementById('cart-discount-message'),
    cartCheckoutBtn: document.getElementById('cart-checkout-btn'),
    cartCounter: document.getElementById('cart-counter'),
    cartDrawerFooter: document.getElementById('cart-drawer-footer'),
    // Mobile Menu
    menuToggleBtn: document.getElementById('menu-toggle-btn'),
    navMenu: document.getElementById('nav-menu')
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    setupEventListeners();
    initCart();
    initMobileMenu();
    initStockCarousel();
    initCalculator();
    await loadInventory();
}

// Set up Event Listeners for Filters, Search, and Sort
function setupEventListeners() {
    // Sizing Tabs Click
    DOM.categoryTabs.addEventListener('click', (e) => {
        const tab = e.target.closest('.tab-btn');
        if (!tab) return;
        
        // Update active tab styling
        DOM.categoryTabs.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
            btn.setAttribute('aria-selected', 'false');
        });
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');
        
        // Update State
        appState.activeCategory = tab.dataset.category;
        applyFiltersAndSort();
    });

    // Search input typing (with debouncing helper)
    let searchTimeout;
    DOM.searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            appState.searchQuery = e.target.value.toLowerCase().trim();
            applyFiltersAndSort();
        }, 150);
    });

    // Sort select change
    DOM.sortSelect.addEventListener('change', (e) => {
        appState.sortBy = e.target.value;
        applyFiltersAndSort();
    });
}

// Load Inventory CSV
async function loadInventory() {
    showLoader(true);
    let response;
    let loadedFromSheet = false;
    
    try {
        // Intenta cargar desde Google Sheets si está configurado
        if (CONFIG.googleSheetUrl) {
            try {
                response = await fetch(CONFIG.googleSheetUrl);
                if (response.ok) {
                    loadedFromSheet = true;
                    console.log('Inventario cargado exitosamente desde Google Sheets');
                } else {
                    console.warn(`Google Sheets retornó estado ${response.status}. Usando respaldo local.`);
                }
            } catch (sheetError) {
                console.warn('Error al conectar con Google Sheets. Usando respaldo local:', sheetError);
            }
        }
        
        // Si no hay respuesta o falló, usa el archivo local
        if (!response || !response.ok) {
            response = await fetch(CONFIG.csvPath);
            if (!response.ok) {
                throw new Error(`No se pudo cargar el archivo de inventario (${response.status})`);
            }
            console.log('Inventario cargado desde archivo local CSV');
        }
        
        const csvText = await response.text();
        const parsedData = parseCSV(csvText);
        
        // Process and validate parsed products
        appState.products = parsedData
            .map(row => processProductRow(row))
            .filter(product => product !== null && product.unidades > 0); // Exclude products with 0 units
            
        // Calculate max dimensions for dynamic scaling
        appState.maxCatalogWidth = Math.max(...appState.products.map(p => p.ancho_cm), 120);
        appState.maxCatalogHeight = Math.max(...appState.products.map(p => p.alto_cm), 220);
            
        updateCategoryCountBadges();
        applyFiltersAndSort();
    } catch (error) {
        console.error('Error al cargar inventario:', error);
        showErrorState(error.message);
    } finally {
        showLoader(false);
    }
}

// Parse CSV Text to Array of Objects
function parseCSV(text) {
    const lines = text.split(/\r?\n/);
    if (lines.length === 0 || !lines[0]) return [];
    
    // Clean and split headers
    const headers = lines[0].split(',').map(h => h.trim());
    const result = [];
    
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const row = [];
        let inQuotes = false;
        let currentValue = '';
        
        for (let j = 0; j < line.length; j++) {
            const char = line[j];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                row.push(currentValue.trim());
                currentValue = '';
            } else {
                currentValue += char;
            }
        }
        row.push(currentValue.trim());
        
        if (row.length >= headers.length) {
            const obj = {};
            headers.forEach((header, index) => {
                let val = row[index];
                // Strip quotes if wrapped
                if (val && val.startsWith('"') && val.endsWith('"')) {
                    val = val.substring(1, val.length - 1);
                }
                obj[header] = val;
            });
            result.push(obj);
        }
    }
    return result;
}

// Convert CSV String row to parsed Product object
function processProductRow(row) {
    try {
        const ancho_cm = parseFloat(row.ancho_cm);
        const alto_cm = parseFloat(row.alto_cm);
        const ancho_m = parseFloat(row.ancho_m.replace(',', '.'));
        const alto_m = parseFloat(row.alto_m.replace(',', '.'));
        const unidades = parseInt(row.unidades, 10);
        
        if (isNaN(ancho_cm) || isNaN(alto_cm) || isNaN(unidades)) {
            return null; // Invalid entry
        }
        
        // Calculate Area for classification
        const area = ancho_m * alto_m;
        
        // Categorize by Size: Chico (<0.5m2), Mediano (0.5m2 to 1.2m2), Grande (>1.2m2)
        let sizeCategory = 'chico';
        if (area > 1.2) {
            sizeCategory = 'grande';
        } else if (area >= 0.5) {
            sizeCategory = 'mediano';
        }
        
        return {
            id: row.id || '',
            tipo: row.tipo || 'Fijo',
            ancho_cm,
            alto_cm,
            ancho_m,
            alto_m,
            unidades,
            estado: row.estado || (unidades <= CONFIG.lowStockThreshold ? 'Bajo stock' : 'Disponible'),
            medida_cm: row.medida_cm || `${ancho_cm} x ${alto_cm} cm`,
            medida_m: row.medida_m || `${ancho_m} x ${alto_m} m`,
            descripcion: row.descripcion || `Termopanel fijo ${ancho_cm} x ${alto_cm} cm`,
            rack: row.rack || '',
            area,
            sizeCategory,
            forma: (row.id === 'TPA014' || (row.descripcion && (row.descripcion.toLowerCase().includes('trapecio') || row.descripcion.toLowerCase().includes('inclinado')))) ? 'trapezoidal' : ((row.descripcion && row.descripcion.toLowerCase().includes('triang')) ? 'triangular' : 'rectangular')
        };
    } catch (e) {
        console.warn('Error al procesar fila del inventario:', row, e);
        return null;
    }
}

// Calculate sizes counts to update tab labels
function updateCategoryCountBadges() {
    const counts = {
        all: appState.products.length,
        chico: appState.products.filter(p => p.sizeCategory === 'chico').length,
        mediano: appState.products.filter(p => p.sizeCategory === 'mediano').length,
        grande: appState.products.filter(p => p.sizeCategory === 'grande').length
    };
    
    // Update labels in DOM
    const allTab = document.getElementById('tab-all');
    const chicoTab = document.getElementById('tab-chico');
    const medianoTab = document.getElementById('tab-mediano');
    const grandeTab = document.getElementById('tab-grande');
    
    if (allTab) allTab.querySelector('span').textContent = `(${counts.all})`;
    if (chicoTab) chicoTab.querySelector('span').textContent = `(${counts.chico})`;
    if (medianoTab) medianoTab.querySelector('span').textContent = `(${counts.mediano})`;
    if (grandeTab) grandeTab.querySelector('span').textContent = `(${counts.grande})`;
}

// Filter and Sort the product lists based on State
function applyFiltersAndSort() {
    let list = [...appState.products];
    
    // 1. Filter by category tab
    if (appState.activeCategory !== 'all') {
        list = list.filter(p => p.sizeCategory === appState.activeCategory);
    }
    
    // 2. Filter by search input (matching width, height, m, cm or general text)
    if (appState.searchQuery) {
        const query = appState.searchQuery;
        list = list.filter(p => {
            return p.medida_cm.toLowerCase().includes(query) ||
                   p.medida_m.toLowerCase().includes(query) ||
                   p.ancho_cm.toString().includes(query) ||
                   p.alto_cm.toString().includes(query);
        });
    }
    
    // 3. Sort list
    list.sort((a, b) => {
        switch (appState.sortBy) {
            case 'dimensions-similar':
                const minA = Math.min(a.ancho_cm, a.alto_cm);
                const minB = Math.min(b.ancho_cm, b.alto_cm);
                if (Math.abs(minA - minB) > 0.001) {
                    return minA - minB;
                }
                const maxA = Math.max(a.ancho_cm, a.alto_cm);
                const maxB = Math.max(b.ancho_cm, b.alto_cm);
                return maxA - maxB;
            case 'stock-desc':
                return b.unidades - a.unidades;
            case 'area-asc':
                return a.area - b.area;
            case 'area-desc':
                return b.area - a.area;
            default:
                const dMinA = Math.min(a.ancho_cm, a.alto_cm);
                const dMinB = Math.min(b.ancho_cm, b.alto_cm);
                if (Math.abs(dMinA - dMinB) > 0.001) {
                    return dMinA - dMinB;
                }
                const dMaxA = Math.max(a.ancho_cm, a.alto_cm);
                const dMaxB = Math.max(b.ancho_cm, b.alto_cm);
                return dMaxA - dMaxB;
        }
    });
    
    appState.filteredProducts = list;
    renderGrid();
    renderStats();
}

// Render Products inside Grid
function renderGrid() {
    DOM.productsGrid.innerHTML = '';
    
    if (appState.filteredProducts.length === 0) {
        renderNoResults();
        return;
    }
    
    appState.filteredProducts.forEach(product => {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.id = `card-${product.id}`;
        
        // Define stock class and text
        const isLowStock = product.estado.toLowerCase() === 'bajo stock' || product.unidades <= CONFIG.lowStockThreshold;
        const statusClass = isLowStock ? 'low-stock' : 'available';
        const statusText = isLowStock ? 'Bajo stock' : 'Disponible';
        
        // Sizing label translations
        const sizeLabelSpanish = {
            chico: 'Chico',
            mediano: 'Mediano',
            grande: 'Grande'
        }[product.sizeCategory];
        
        
        // Calculate relative scale percentages based on maximum dimensions
        
        // Calculate relative scale percentages based on maximum dimensions
        const maxWidth = appState.maxCatalogWidth || 140;
        const maxHeight = appState.maxCatalogHeight || 240;
        
        // Scale to fit nicely inside the container (max 88% width/height to avoid touching container borders)
        const maxScalePercent = 88;
        const minScalePercent = 25; // Keep very small windows visible and proportional
        const widthPercent = Math.max(minScalePercent, (product.ancho_cm / maxWidth) * maxScalePercent);
        const heightPercent = Math.max(minScalePercent, (product.alto_cm / maxHeight) * maxScalePercent);
        
        const isTriangular = product.forma === 'triangular';
        const isTrapezoidal = product.forma === 'trapezoidal';
        const isSpecialShape = isTriangular || isTrapezoidal;
        const glassRepClass = isSpecialShape ? 'glass-representation triangular-pane' : 'glass-representation';
        
        let glassContentHtml = '';
        if (isTriangular) {
            glassContentHtml = `
                <svg viewBox="0 0 100 100" class="glass-svg-triangle glass-pane-simulation" preserveAspectRatio="none" style="width: ${widthPercent}%; height: ${heightPercent}%;">
                    <defs>
                        <linearGradient id="glassGrad-${product.id}" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stop-color="#e0f2fe" stop-opacity="0.85" />
                            <stop offset="100%" stop-color="#bae6fd" stop-opacity="0.45" />
                        </linearGradient>
                    </defs>
                    <polygon points="4,4 4,96 96,96" fill="url(#glassGrad-${product.id})" class="outer-tri" />
                    <polygon points="12,12 12,88 88,88" class="inner-tri" />
                    <line x1="15" y1="40" x2="60" y2="85" class="glare-line" />
                </svg>
                <div class="glass-icon-wrapper">
                    <span class="size-category-badge">${sizeLabelSpanish}</span>
                    <span class="shape-badge">Triangular</span>
                </div>
            `;
        } else if (isTrapezoidal) {
            glassContentHtml = `
                <svg viewBox="0 0 100 100" class="glass-svg-triangle glass-pane-simulation" preserveAspectRatio="none" style="width: ${widthPercent}%; height: ${heightPercent}%;">
                    <defs>
                        <linearGradient id="glassGrad-${product.id}" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stop-color="#e0f2fe" stop-opacity="0.85" />
                            <stop offset="100%" stop-color="#bae6fd" stop-opacity="0.45" />
                        </linearGradient>
                    </defs>
                    <polygon points="4,4 30,4 96,96 4,96" fill="url(#glassGrad-${product.id})" class="outer-tri" />
                    <polygon points="12,12 32,12 88,88 12,88" class="inner-tri" />
                    <line x1="15" y1="40" x2="60" y2="85" class="glare-line" />
                </svg>
                <div class="glass-icon-wrapper">
                    <span class="size-category-badge">${sizeLabelSpanish}</span>
                    <span class="shape-badge">Inclinado</span>
                </div>
            `;
        } else {
            glassContentHtml = `
                <div class="glass-pane-simulation" style="width: ${widthPercent}%; height: ${heightPercent}%;"></div>
                <div class="glass-icon-wrapper">
                    <span class="size-category-badge">${sizeLabelSpanish}</span>
                </div>
            `;
        }
        
        const shapeDetailHtml = isTriangular ? `
                <li>
                    <span class="detail-label">Diseño</span>
                    <span class="detail-value highlight-shape">Con forma (Triangular)</span>
                </li>
        ` : (isTrapezoidal ? `
                <li>
                    <span class="detail-label">Diseño</span>
                    <span class="detail-value highlight-shape">Con forma (Inclinado / Trapecio)</span>
                </li>
        ` : '');
        
        card.innerHTML = `
            <div class="${glassRepClass}" aria-hidden="true">
                ${glassContentHtml}
            </div>
            
            <h3 class="product-size-title">
                ${product.ancho_cm} x ${product.alto_cm} <span>cm</span>
            </h3>
            
            <div class="product-meters">${product.ancho_m} x ${product.alto_m} m</div>
            
            <ul class="product-details-list">
                <li>
                    <span class="detail-label">Disponibilidad</span>
                    <span class="status-badge ${statusClass}">${statusText}</span>
                </li>
                <li>
                    <span class="detail-label">Unidades en stock</span>
                    <span class="detail-value">${product.unidades}</span>
                </li>
                ${shapeDetailHtml}
                <li>
                    <span class="detail-label">Vidrios</span>
                    <span class="detail-value">Doble 4mm</span>
                </li>
                <li>
                    <span class="detail-label">Separador</span>
                    <span class="detail-value">Bronce 11.5mm</span>
                </li>
            </ul>
            
            <div class="product-card-qty-row">
                <span class="qty-label">Cantidad:</span>
                <div class="product-qty-selector">
                    <button class="qty-btn" onclick="decrementProductQty('${product.id}')" aria-label="Restar una unidad">-</button>
                    <input type="number" class="qty-val-input" id="qty-val-${product.id}" value="1" min="1" max="${product.unidades}" readonly>
                    <button class="qty-btn" onclick="incrementProductQty('${product.id}', ${product.unidades})" aria-label="Sumar una unidad">+</button>
                </div>
            </div>
            
            <div class="product-actions">
                <button onclick="buyProductDirectly('${product.id}')" class="cta-button whatsapp" id="btn-quote-${product.id}">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24">
                        <path d="M12.031 2c-5.502 0-9.969 4.468-9.969 9.97 0 1.758.459 3.479 1.332 4.995L2 22l5.176-1.358c1.466.8 3.102 1.22 4.85 1.22h.004c5.502 0 9.969-4.467 9.969-9.969A9.92 9.92 0 0 0 12.031 2zm0 18.06h-.003c-1.558 0-3.085-.418-4.417-1.21l-.317-.188-3.284.861.876-3.2-.206-.328c-.87-1.385-1.33-2.988-1.33-4.636 0-4.693 3.82-8.513 8.517-8.513a8.44 8.44 0 0 1 6.021 2.496a8.44 8.44 0 0 1 2.493 6.024c.001 4.693-3.82 8.516-8.517 8.516zm4.665-6.381c-.255-.127-1.505-.742-1.738-.827-.233-.085-.403-.127-.572.127-.169.254-.656.828-.804.997-.148.17-.297.19-.552.063-.255-.127-.1.08-.1.08-1.077-.373-1.954-.954-2.73-1.628-.663-.576-1.11-1.288-1.24-1.542-.128-.255-.014-.393.114-.52.115-.115.255-.297.382-.445.127-.148.169-.254.254-.424.085-.17.042-.318-.021-.445-.064-.127-.572-1.377-.784-1.886-.207-.5-.436-.43-.572-.43-.148 0-.318-.008-.488-.008a.94.94 0 0 0-.678.318c-.233.255-.89.87-.89 2.123 0 1.254.912 2.463 1.04 2.632.127.17 1.795 2.748 4.348 3.85.607.262 1.081.42 1.45.538.61.194 1.165.166 1.603.1.488-.073 1.505-.615 1.717-1.208.212-.593.212-1.102.148-1.208-.063-.105-.233-.148-.488-.275z"/>
                    </svg>
                    Comprar Ahora
                </button>
                <button class="cta-button add-to-cart-btn" onclick="addToCart('${product.id}')" id="btn-add-cart-${product.id}">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                    Añadir al Carrito
                </button>
            </div>
        `;
        
        DOM.productsGrid.appendChild(card);
    });
}

// Direct purchase action on WhatsApp for a single product card
window.buyProductDirectly = function(productId) {
    const product = appState.products.find(p => p.id === productId);
    if (!product) return;
    
    const qtyInput = document.getElementById(`qty-val-${productId}`);
    const qty = qtyInput ? parseInt(qtyInput.value, 10) : 1;
    
    let formaText = '';
    if (product.forma === 'triangular') {
        formaText = ' con forma triangular';
    } else if (product.forma === 'trapezoidal') {
        formaText = ' con forma inclinada (trapecio)';
    }
    
    const unitWord = qty === 1 ? 'unidad' : 'unidades';
    const message = `Hola! Quiero comprar un termopanel fijo${formaText} de medida ${product.ancho_cm} x ${product.alto_cm} cm.

Necesito ${qty} ${unitWord}.

Quedo atento/a para coordinar el retiro y pago. Gracias.`;

    const encodedText = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${CONFIG.whatsappNumber}?text=${encodedText}`;
    window.open(whatsappUrl, '_blank');
};

// Render Stats at bottom of filters
function renderStats() {
    const count = appState.filteredProducts.length;
    DOM.resultsCount.textContent = count === 1 
        ? '1 medida encontrada' 
        : `${count} medidas encontradas`;
        
    let filterText = '';
    if (appState.activeCategory !== 'all') {
        const categoryLabels = { chico: 'Chicos', mediano: 'Medianos', grande: 'Grandes' };
        filterText += `Categoría: ${categoryLabels[appState.activeCategory]}`;
    }
    
    if (appState.searchQuery) {
        if (filterText) filterText += ' | ';
        filterText += `Búsqueda: "${appState.searchQuery}"`;
    }
    
    DOM.activeFiltersInfo.textContent = filterText;
}

// Render Empty/No Results View
function renderNoResults() {
    DOM.productsGrid.innerHTML = `
        <div class="no-results" id="no-results-view">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                <line x1="8" y1="11" x2="14" y2="11"></line>
            </svg>
            <h3>No encontramos medidas que coincidan</h3>
            <p>Prueba buscando otras dimensiones o limpia los filtros de búsqueda.</p>
            <button class="no-results-btn" onclick="clearFilters()" id="btn-clear-filters">Limpiar Filtros</button>
        </div>
    `;
}

// Global helper to clear inputs
window.clearFilters = function() {
    DOM.searchInput.value = '';
    appState.searchQuery = '';
    
    // Reset tabs
    DOM.categoryTabs.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.setAttribute('aria-selected', 'false');
    });
    const allTab = document.getElementById('tab-all');
    if (allTab) {
        allTab.classList.add('active');
        allTab.setAttribute('aria-selected', 'true');
    }
    
    appState.activeCategory = 'all';
    applyFiltersAndSort();
};

// Loader helpers
function showLoader(show) {
    if (DOM.loader) {
        DOM.loader.style.display = show ? 'flex' : 'none';
    }
}

// Show Error View if fetching/loading fails
function showErrorState(message) {
    DOM.productsGrid.innerHTML = `
        <div class="no-results" style="border-color: var(--color-low-stock-bg); background-color: #fffbfa;" id="error-view">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-low-stock)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"></polygon>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <h3 style="color: var(--color-low-stock);">Error al cargar el catálogo</h3>
            <p>${message}</p>
            <button class="no-results-btn" style="background-color: var(--color-low-stock); color: white;" onclick="location.reload()" id="btn-reload">Intentar de nuevo</button>
        </div>
    `;
}

// ==========================================================================
// Shopping Cart and Mobile Navigation Functionality
// ==========================================================================

// Initialize Shopping Cart Logic and Event Listeners
function initCart() {
    // Load cart from localStorage
    appState.cart = JSON.parse(localStorage.getItem('termopaneles_cart')) || [];
    updateCartUI();

    // Toggle Drawer Open
    if (DOM.cartToggle) {
        DOM.cartToggle.addEventListener('click', () => {
            openCart(true);
        });
    }

    // Toggle Drawer Close
    if (DOM.cartClose) {
        DOM.cartClose.addEventListener('click', () => {
            openCart(false);
        });
    }

    // Overlay Close
    if (DOM.cartOverlay) {
        DOM.cartOverlay.addEventListener('click', () => {
            openCart(false);
        });
    }

    // Cart Checkout
    if (DOM.cartCheckoutBtn) {
        DOM.cartCheckoutBtn.addEventListener('click', () => {
            checkoutCart();
        });
    }
}

// Toggle drawer state
function openCart(open) {
    if (DOM.cartDrawer) {
        DOM.cartDrawer.setAttribute('aria-hidden', !open);
    }
    // Close mobile menu to prevent overlap
    if (open && DOM.menuToggleBtn && DOM.menuToggleBtn.classList.contains('active')) {
        DOM.menuToggleBtn.classList.remove('active');
        DOM.navMenu.classList.remove('active');
    }
}

// Initialize Mobile Menu listeners
function initMobileMenu() {
    if (DOM.menuToggleBtn && DOM.navMenu) {
        DOM.menuToggleBtn.addEventListener('click', () => {
            DOM.menuToggleBtn.classList.toggle('active');
            DOM.navMenu.classList.toggle('active');
            // Close cart drawer if open
            openCart(false);
        });

        // Close menu when clicking nav link
        DOM.navMenu.addEventListener('click', (e) => {
            if (e.target.classList.contains('nav-link')) {
                DOM.menuToggleBtn.classList.remove('active');
                DOM.navMenu.classList.remove('active');
            }
        });
    }
}

// Product card quantity selectors
window.incrementProductQty = function(productId, maxVal) {
    const input = document.getElementById(`qty-val-${productId}`);
    if (input) {
        let val = parseInt(input.value, 10);
        if (val < maxVal) {
            input.value = val + 1;
        } else {
            alert(`No puedes agregar más unidades de esta medida. Stock disponible: ${maxVal}`);
        }
    }
};

window.decrementProductQty = function(productId) {
    const input = document.getElementById(`qty-val-${productId}`);
    if (input) {
        let val = parseInt(input.value, 10);
        if (val > 1) {
            input.value = val - 1;
        }
    }
};

// Add termopanel to cart
window.addToCart = function(productId) {
    const product = appState.products.find(p => p.id === productId);
    if (!product) return;

    // Get selected quantity from input selector in the card
    const qtyInput = document.getElementById(`qty-val-${productId}`);
    const selectedQty = qtyInput ? parseInt(qtyInput.value, 10) : 1;

    // Find if already in cart
    const cartItem = appState.cart.find(item => item.id === productId);

    if (cartItem) {
        // Check stock availability
        if (cartItem.qty + selectedQty > product.unidades) {
            alert(`No puedes agregar esa cantidad. Total en el carro superaría el stock disponible de ${product.unidades}`);
            return;
        }
        cartItem.qty += selectedQty;
    } else {
        appState.cart.push({
            id: product.id,
            ancho_cm: product.ancho_cm,
            alto_cm: product.alto_cm,
            medida_cm: product.medida_cm,
            forma: product.forma,
            qty: selectedQty,
            maxQty: product.unidades
        });
    }

    // Reset selector to 1 after adding to cart
    if (qtyInput) {
        qtyInput.value = 1;
    }

    // Save state
    saveCart();
    updateCartUI();
    // Open drawer as confirmation feedback
    openCart(true);
};

// Update quantity
window.updateCartQty = function(productId, delta) {
    const cartItem = appState.cart.find(item => item.id === productId);
    if (!cartItem) return;

    const newQty = cartItem.qty + delta;
    if (newQty < 1) {
        removeFromCart(productId);
        return;
    }

    if (newQty > cartItem.maxQty) {
        alert(`No puedes solicitar más unidades. Stock disponible en bodega: ${cartItem.maxQty}`);
        return;
    }

    cartItem.qty = newQty;
    saveCart();
    updateCartUI();
};

// Remove item from cart
window.removeFromCart = function(productId) {
    appState.cart = appState.cart.filter(item => item.id !== productId);
    saveCart();
    updateCartUI();
};

// Save cart to localStorage
function saveCart() {
    localStorage.setItem('termopaneles_cart', JSON.stringify(appState.cart));
}

// Pricing rules by volume
function getCartPricing(totalUnits) {
    let unitPrice = 25000;
    let priceLabel = '$25.000 c/u (Precio normal)';
    let totalEstimated = `$${(totalUnits * 25000).toLocaleString('es-CL')}`;
    let discountMsg = '';

    if (totalUnits >= 40) {
        unitPrice = 15000;
        priceLabel = '$15.000 c/u (Oferta volumen)';
        totalEstimated = `$${(totalUnits * 15000).toLocaleString('es-CL')}`;
        discountMsg = '¡Súper precio mayorista de $15.000 c/u aplicado! (Máximo descuento)';
    } else if (totalUnits >= 10) {
        unitPrice = 20000;
        priceLabel = '$20.000 c/u (Oferta volumen)';
        totalEstimated = `$${(totalUnits * 20000).toLocaleString('es-CL')}`;
        const unitsNeeded = 40 - totalUnits;
        discountMsg = `¡Precio mayorista de $20.000 c/u aplicado! Agrega ${unitsNeeded} más para obtener precio súper mayorista de $15.000 c/u.`;
    } else {
        const unitsNeeded = 10 - totalUnits;
        discountMsg = `Lleva 10 unidades o más en total para activar el precio de oferta de $20.000 c/u (Te faltan ${unitsNeeded} uni).`;
    }

    return {
        unitPrice,
        priceLabel,
        totalEstimated,
        discountMsg
    };
}

// Update Cart DOM elements
function updateCartUI() {
    if (!DOM.cartItemsList || !DOM.cartCounter || !DOM.cartTotalUnits) return;

    // Calculate total units in cart
    const totalUnits = appState.cart.reduce((sum, item) => sum + item.qty, 0);

    // Update floating counter in navbar
    DOM.cartCounter.textContent = totalUnits;
    DOM.cartCounter.style.display = totalUnits > 0 ? 'flex' : 'none';

    // Check if empty
    if (appState.cart.length === 0) {
        if (DOM.cartEmptyState) DOM.cartEmptyState.style.display = 'flex';
        if (DOM.cartDrawerFooter) DOM.cartDrawerFooter.style.display = 'none';
        DOM.cartItemsList.innerHTML = '';
        DOM.cartTotalUnits.textContent = '0';
        return;
    }

    // Hide empty state and show footer
    if (DOM.cartEmptyState) DOM.cartEmptyState.style.display = 'none';
    if (DOM.cartDrawerFooter) DOM.cartDrawerFooter.style.display = 'block';

    DOM.cartTotalUnits.textContent = totalUnits;

    // Update pricing and discount display in cart footer
    const pricing = getCartPricing(totalUnits);
    const hasDiscount = totalUnits >= 10;
    if (DOM.cartUnitPrice) {
        DOM.cartUnitPrice.textContent = pricing.priceLabel;
        if (hasDiscount) {
            DOM.cartUnitPrice.className = 'price-highlight discount-applied';
        } else {
            DOM.cartUnitPrice.className = '';
        }
    }
    if (DOM.cartTotalPrice) {
        DOM.cartTotalPrice.textContent = pricing.totalEstimated;
        if (hasDiscount) {
            DOM.cartTotalPrice.className = 'price-highlight discount-applied';
        } else {
            DOM.cartTotalPrice.className = '';
        }
    }
    if (DOM.cartDiscountMessage) {
        DOM.cartDiscountMessage.textContent = pricing.discountMsg;
        if (hasDiscount) {
            DOM.cartDiscountMessage.className = 'cart-discount-message success';
        } else {
            DOM.cartDiscountMessage.className = 'cart-discount-message info';
        }
    }

    // Render items list
    DOM.cartItemsList.innerHTML = '';
    appState.cart.forEach(item => {
        const itemElement = document.createElement('div');
        itemElement.className = 'cart-item';
        itemElement.id = `cart-item-${item.id}`;

        const isTriangular = item.forma === 'triangular';
        const isTrapezoidal = item.forma === 'trapezoidal';
        const shapeLabel = isTriangular ? ' (Triangular)' : (isTrapezoidal ? ' (Inclinado)' : '');

        itemElement.innerHTML = `
            <div class="cart-item-thumb" aria-hidden="true">
                <div class="cart-item-glass-pane"></div>
            </div>
            
            <div class="cart-item-details">
                <div class="cart-item-title">${item.medida_cm}${shapeLabel}</div>
                <div class="cart-item-sub">Stock Máx: ${item.maxQty} u</div>
                
                <div class="cart-qty-controls">
                    <button class="qty-btn" onclick="updateCartQty('${item.id}', -1)" aria-label="Restar una unidad">-</button>
                    <span class="qty-val">${item.qty}</span>
                    <button class="qty-btn" onclick="updateCartQty('${item.id}', 1)" aria-label="Sumar una unidad">+</button>
                </div>
            </div>
            
            <button class="cart-remove-btn" onclick="removeFromCart('${item.id}')" aria-label="Eliminar de la cotización">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    <line x1="10" y1="11" x2="10" y2="17"></line>
                    <line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
            </button>
        `;
        DOM.cartItemsList.appendChild(itemElement);
    });
}

// Generate consolidated WhatsApp quote link
function checkoutCart() {
    if (appState.cart.length === 0) return;

    const totalUnits = appState.cart.reduce((sum, item) => sum + item.qty, 0);
    const pricing = getCartPricing(totalUnits);

    let itemsText = '';
    appState.cart.forEach(item => {
        const isTriangular = item.forma === 'triangular';
        const isTrapezoidal = item.forma === 'trapezoidal';
        const shapeText = isTriangular ? ' triangular' : (isTrapezoidal ? ' inclinada (trapecio)' : '');
        const unitWord = item.qty === 1 ? 'unidad' : 'unidades';
        itemsText += `* ${item.qty} ${unitWord} de medida ${item.medida_cm}${shapeText}\n`;
    });

    const priceAppliedText = `$${pricing.unitPrice.toLocaleString('es-CL')} c/u`;
    const totalEstimatedText = `$${(totalUnits * pricing.priceLabel).toLocaleString('es-CL')}`; // Wait, pricing.totalEstimated or use custom calculation
    const totalCalc = totalUnits * pricing.unitPrice;
    const totalCalcText = `$${totalCalc.toLocaleString('es-CL')}`;

    const message = `Hola, quiero comprar los siguientes termopaneles:

${itemsText}
Total unidades: ${totalUnits}
Precio unitario aplicado: ${priceAppliedText}
Total: ${totalCalcText}`;

    const encodedText = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${CONFIG.whatsappNumber}?text=${encodedText}`;

    // Open WhatsApp in a new tab
    window.open(whatsappUrl, '_blank');
}

// Carousel initialization for Real Stock photos
function initStockCarousel() {
    const track = document.getElementById('carousel-track');
    const slides = Array.from(track ? track.children : []);
    const prevBtn = document.getElementById('carousel-prev');
    const nextBtn = document.getElementById('carousel-next');
    const indicatorsContainer = document.getElementById('carousel-indicators');
    
    if (!track || slides.length === 0) return;
    
    let currentIndex = 0;
    let startX = 0;
    let isDragging = false;
    
    // Dynamic indicators setup
    function updateIndicators() {
        if (!indicatorsContainer) return;
        indicatorsContainer.innerHTML = '';
        slides.forEach((_, idx) => {
            const dot = document.createElement('span');
            dot.className = `indicator-dot${idx === currentIndex ? ' active' : ''}`;
            dot.dataset.slide = idx;
            dot.addEventListener('click', () => {
                goToSlide(idx);
            });
            indicatorsContainer.appendChild(dot);
        });
    }
    
    function goToSlide(index) {
        if (index < 0) index = 0;
        if (index >= slides.length) index = slides.length - 1;
        
        currentIndex = index;
        const offset = -currentIndex * 100;
        track.style.transform = `translateX(${offset}%)`;
        
        // Update dots
        if (indicatorsContainer) {
            const dots = indicatorsContainer.querySelectorAll('.indicator-dot');
            dots.forEach((dot, idx) => {
                if (idx === currentIndex) {
                    dot.classList.add('active');
                } else {
                    dot.classList.remove('active');
                }
            });
        }
        
        // Update arrow visibility (opacities)
        if (prevBtn) prevBtn.style.opacity = currentIndex === 0 ? '0.4' : '1';
        if (nextBtn) nextBtn.style.opacity = currentIndex === slides.length - 1 ? '0.4' : '1';
    }
    
    // Click listeners
    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (currentIndex > 0) goToSlide(currentIndex - 1);
        });
    }
    
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            if (currentIndex < slides.length - 1) goToSlide(currentIndex + 1);
        });
    }
    
    // Touch Gestures for mobile swipe
    track.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        isDragging = true;
        track.style.transition = 'none'; // remove transition for real-time tracking
    });
    
    track.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        const currentX = e.touches[0].clientX;
        const diffX = currentX - startX;
        
        const trackWidth = track.offsetWidth;
        const dragPercent = (diffX / trackWidth) * 100;
        const currentTranslate = -currentIndex * 100 + dragPercent;
        
        // Add elastic bounds
        const maxDrag = 15;
        const minBound = -((slides.length - 1) * 100) - maxDrag;
        const maxBound = maxDrag;
        const clampedTranslate = Math.max(minBound, Math.min(maxBound, currentTranslate));
        
        track.style.transform = `translateX(${clampedTranslate}%)`;
    });
    
    track.addEventListener('touchend', (e) => {
        if (!isDragging) return;
        isDragging = false;
        track.style.transition = 'transform 0.4s cubic-bezier(0.25, 1, 0.5, 1)';
        
        const endX = e.changedTouches[0].clientX;
        const diffX = endX - startX;
        const trackWidth = track.offsetWidth;
        const swipeThreshold = trackWidth * 0.15; // 15% swipe threshold
        
        if (diffX < -swipeThreshold && currentIndex < slides.length - 1) {
            goToSlide(currentIndex + 1);
        } else if (diffX > swipeThreshold && currentIndex > 0) {
            goToSlide(currentIndex - 1);
        } else {
            goToSlide(currentIndex);
        }
    });
    
    // Initialize
    updateIndicators();
    goToSlide(0);
}

// Initialize Calculator Logic for window frame (vano) comparison
function initCalculator() {
    const wInput = document.getElementById('vano-width');
    const hInput = document.getElementById('vano-height');
    const calcBtn = document.getElementById('calc-btn');
    const resultsContainer = document.getElementById('calc-results');
    
    if (!wInput || !hInput || !calcBtn || !resultsContainer) return;
    
    calcBtn.addEventListener('click', () => {
        const widthVal = parseFloat(wInput.value);
        const heightVal = parseFloat(hInput.value);
        
        if (isNaN(widthVal) || isNaN(heightVal) || widthVal <= 0 || heightVal <= 0) {
            alert('Por favor, ingresa un ancho y alto válidos en centímetros.');
            return;
        }
        
        if (appState.products.length === 0) {
            alert('Cargando el inventario, por favor intenta en un momento.');
            return;
        }
        
        calculateClosestMatches(widthVal, heightVal);
    });
}

function calculateClosestMatches(userWidth, userHeight) {
    const resultsContainer = document.getElementById('calc-results');
    if (!resultsContainer) return;
    
    // Calculate distance for each product (excluding 0 stock ones already filtered out)
    const scoredProducts = appState.products.map(p => {
        const wDiff = p.ancho_cm - userWidth;
        const hDiff = p.alto_cm - userHeight;
        const totalDist = Math.abs(wDiff) + Math.abs(hDiff);
        return {
            product: p,
            wDiff,
            hDiff,
            totalDist
        };
    });
    
    // Filter to keep only matches with a difference of up to 15cm in BOTH dimensions
    const filteredMatches = scoredProducts.filter(match => {
        return Math.abs(match.wDiff) <= 15 && Math.abs(match.hDiff) <= 15;
    });
    
    // Sort by total distance ascending
    filteredMatches.sort((a, b) => a.totalDist - b.totalDist);
    
    // Take top 3
    const topMatches = filteredMatches.slice(0, 3);
    
    // Render
    resultsContainer.innerHTML = '';
    
    if (filteredMatches.length === 0) {
        resultsContainer.innerHTML = `
            <div class="calc-no-results">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-low-stock)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <h3>Lo sentimos, no tenemos esa medida</h3>
                <p>No disponemos de termopaneles en stock dentro del rango de diferencia de 15 cm de tu vano (${userWidth} x ${userHeight} cm).</p>
                <div class="calc-no-results-actions">
                    <a href="#catalog-section" class="calc-btn-secondary">Ver Catálogo Completo</a>
                </div>
            </div>
        `;
        return;
    }
    
    topMatches.forEach(match => {
        const p = match.product;
        const card = document.createElement('div');
        card.className = 'calc-result-card';
        
        // Helper to format diff tags
        const formatDiff = (diff, axis) => {
            const axisText = axis === 'w' ? 'ancho' : 'alto';
            if (diff === 0) {
                return `<span class="diff-tag exact">${axisText === 'ancho' ? 'Ancho exacto' : 'Alto exacto'}</span>`;
            } else if (diff > 0) {
                return `<span class="diff-tag plus">+${diff} cm (${axisText === 'ancho' ? 'más ancho' : 'más alto'})</span>`;
            } else {
                return `<span class="diff-tag minus">${diff} cm (${axisText === 'ancho' ? 'más angosto' : 'más bajo'})</span>`;
            }
        };
        
        const wTag = formatDiff(match.wDiff, 'w');
        const hTag = formatDiff(match.hDiff, 'h');
        
        card.innerHTML = `
            <div class="calc-result-header">
                <h3 class="calc-result-title">${p.ancho_cm} x ${p.alto_cm} <span>cm</span></h3>
                <span class="size-category-badge">${p.sizeCategory === 'chico' ? 'Chico' : (p.sizeCategory === 'mediano' ? 'Mediano' : 'Grande')}</span>
            </div>
            <div class="calc-diff-info">
                ${wTag}
                ${hTag}
            </div>
            <div class="calc-result-footer">
                <span class="calc-stock-info">Stock: <strong>${p.unidades} u</strong></span>
                <button class="calc-action-btn" onclick="buyProductDirectly('${p.id}')">Comprar Ahora</button>
            </div>
        `;
        resultsContainer.appendChild(card);
    });
}
