/**
 * App.js - Catalog controller for Termopaneles Fijos
 * Fetches, parses, filters, sorts and displays products from CSV
 */

// Configuration
const CONFIG = {
    csvPath: 'inventario-termopaneles-landing.csv',
    googleSheetUrl: 'https://docs.google.com/spreadsheets/d/1XiVBqJeEwqdkMm3JSrA33OnbGS9N9mfvRjPg-U006no/edit?gid=324384237#gid=324384237', // 
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
    initPlanner();
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
        const unidades = parseInt(row.unidades, 10);
        
        if (isNaN(ancho_cm) || isNaN(alto_cm) || isNaN(unidades)) {
            return null; // Invalid entry
        }

        let ancho_m;
        if (row.ancho_m !== undefined && row.ancho_m !== null && row.ancho_m !== '') {
            ancho_m = parseFloat(row.ancho_m.toString().replace(',', '.'));
        } else {
            ancho_m = ancho_cm / 100;
        }

        let alto_m;
        if (row.alto_m !== undefined && row.alto_m !== null && row.alto_m !== '') {
            alto_m = parseFloat(row.alto_m.toString().replace(',', '.'));
        } else {
            alto_m = alto_cm / 100;
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
                <button onclick="buyProductDirectly('${product.id}')" class="cta-button" id="btn-quote-${product.id}" style="background-color: var(--color-olive); color: white;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px;">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                        <polyline points="22,6 12,13 2,6"></polyline>
                    </svg>
                    Cotizar
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
window.buyProductDirectly = async function(productId) {
    const product = appState.products.find(p => p.id === productId);
    if (!product) return;
    
    const qtyInput = document.getElementById(`qty-val-${productId}`);
    const qty = qtyInput ? parseInt(qtyInput.value, 10) : 1;
    
    const email = prompt("Por favor, ingresa tu correo electrónico para recibir la cotización:");
    if (email === null) return;
    const cleanEmail = email.trim();
    if (!cleanEmail) {
        alert("Debes ingresar un correo electrónico.");
        return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
        alert("Por favor, ingresa un correo electrónico válido.");
        return;
    }

    const btn = document.getElementById(`btn-quote-${productId}`);
    let originalHtml = '';
    if (btn) {
        originalHtml = btn.innerHTML;
        btn.innerHTML = 'Enviando...';
        btn.disabled = true;
    }

    try {
        const response = await fetch('https://javicarrizo.app.n8n.cloud/webhook/cotizar-termopanel', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                ancho_cm: product.ancho_cm,
                alto_cm: product.alto_cm,
                qty: qty,
                email: cleanEmail,
                origen: 'catalogo_individual'
            }),
            signal: AbortSignal.timeout(15000)
        });

        if (response.ok) {
            alert(`¡Cotización enviada con éxito! Revisa tu correo: ${cleanEmail}`);
        } else {
            alert("No pudimos procesar el envío de la cotización. Inténtalo de nuevo.");
        }
    } catch (error) {
        console.error('Error or timeout sending quote to webhook:', error);
        alert("Error de conexión al enviar la cotización. Revisa tu internet e inténtalo de nuevo.");
    } finally {
        if (btn) {
            btn.innerHTML = originalHtml;
            btn.disabled = false;
        }
    }
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
async function checkoutCart() {
    if (appState.cart.length === 0) return;

    const totalUnits = appState.cart.reduce((sum, item) => sum + item.qty, 0);
    const pricing = getCartPricing(totalUnits);

    const email = prompt("Por favor, ingresa tu correo electrónico para recibir la cotización de tu carro:");
    if (email === null) return;
    const cleanEmail = email.trim();
    if (!cleanEmail) {
        alert("Debes ingresar un correo electrónico.");
        return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
        alert("Por favor, ingresa un correo electrónico válido.");
        return;
    }

    const btn = DOM.cartCheckoutBtn;
    let originalHtml = '';
    if (btn) {
        originalHtml = btn.innerHTML;
        btn.innerHTML = 'Enviando...';
        btn.disabled = true;
    }

    const totalCalc = totalUnits * pricing.unitPrice;

    try {
        const response = await fetch('https://javicarrizo.app.n8n.cloud/webhook/cotizar-termopanel', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                items: appState.cart,
                totalUnits,
                totalCalc,
                email: cleanEmail,
                origen: 'carrito'
            }),
            signal: AbortSignal.timeout(15000)
        });

        if (response.ok) {
            alert(`¡Cotización del carro enviada con éxito! Revisa tu correo: ${cleanEmail}`);
            appState.cart = [];
            saveCart();
            updateCartUI();
            openCart(false);
        } else {
            alert("No pudimos procesar la cotización de tu carro. Inténtalo de nuevo.");
        }
    } catch (error) {
        console.error('Error or timeout sending cart quote to webhook:', error);
        alert("Error de conexión al enviar la cotización. Revisa tu internet e inténtalo de nuevo.");
    } finally {
        if (btn) {
            btn.innerHTML = originalHtml;
            btn.disabled = false;
        }
    }
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
                <button class="calc-action-btn" onclick="buyProductDirectly('${p.id}')" style="background-color: var(--color-olive); color: white;">Cotizar</button>
            </div>
        `;
        resultsContainer.appendChild(card);
    });
}

// ==========================================================================
// Planificador de Cobertura Implementation
// ===============================================// Initialize Coverage Planner tool v2
function initPlanner() {
    const wInput = document.getElementById('planner-width');
    const hInput = document.getElementById('planner-height');
    const pInput = document.getElementById('planner-panes');
    const dSelect = document.getElementById('planner-distribution');
    const prSelect = document.getElementById('planner-priority');
    const tSelect = document.getElementById('planner-tolerance');
    const rSelect = document.getElementById('planner-rotation');
    const plannerBtn = document.getElementById('planner-btn');
    const resultsContainer = document.getElementById('planner-results');

    if (!wInput || !hInput || !pInput || !dSelect || !prSelect || !tSelect || !rSelect || !plannerBtn || !resultsContainer) return;

    // Collapse instructions on mobile by default
    const instructions = document.querySelector('.planner-instructions');
    if (instructions && window.innerWidth < 768) {
        instructions.removeAttribute('open');
    }

    plannerBtn.addEventListener('click', () => {
        const widthVal = parseFloat(wInput.value);
        const heightVal = parseFloat(hInput.value);
        const panesVal = pInput.value;
        const distVal = dSelect.value;
        const priorityVal = prSelect.value;
        const toleranceVal = parseFloat(tSelect.value);
        const rotationVal = rSelect.value;

        if (isNaN(widthVal) || isNaN(heightVal) || widthVal <= 0 || heightVal <= 0) {
            alert('Por favor, ingresa un ancho y alto válidos en centímetros.');
            return;
        }

        // Límite de la herramienta: Ancho máx: 600 cm, Alto máx: 300 cm
        if (widthVal > 600 || heightVal > 300) {
            resultsContainer.innerHTML = `
                <div class="planner-limit-exceeded">
                    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                        <line x1="12" y1="9" x2="12" y2="13"></line>
                        <line x1="12" y1="17" x2="12.01" y2="17"></line>
                    </svg>
                    <h3>Medidas superan el límite del stock estándar</h3>
                    <p>Para espacios mayores o proyectos con varios paños, solicita una cotización y revisamos alternativas según el stock disponible.</p>
                    <div class="planner-limit-exceeded-actions">
                        <button onclick="quoteCustomClosing(${widthVal}, ${heightVal})" class="calc-btn" style="background-color: var(--color-olive); color: white; border: none; padding: 12px 24px; border-radius: 8px; font-weight: bold; cursor: pointer;">Cotizar</button>
                    </div>
                </div>
            `;
            return;
        }

        // Show loading state
        resultsContainer.innerHTML = `
            <div class="calc-placeholder">
                <p>Calculando distribuciones referenciales en base a tu stock...</p>
            </div>
        `;

        setTimeout(() => {
            const alternatives = findCoverageCombinationsAdvanced(
                widthVal, 
                heightVal, 
                panesVal, 
                distVal, 
                priorityVal, 
                rotationVal, 
                toleranceVal, 
                appState.products
            );
            renderPlannerProposals(alternatives, widthVal, heightVal, resultsContainer);
        }, 100);
    });
}

// Algoritmo de Búsqueda Avanzado de Cobertura
function findCoverageCombinationsAdvanced(targetW, targetH, maxPanesStr, distType, priority, allowRotationStr, tolerance, inventory) {
    const allowRotation = (allowRotationStr === 'yes');
    
    // Máximo de termopaneles por propuesta: 8 (Límite técnico)
    let maxPanes = 8;
    if (maxPanesStr !== 'all') {
        maxPanes = parseInt(maxPanesStr, 10);
        if (isNaN(maxPanes) || maxPanes > 8) maxPanes = 8;
    }

    let allProposals = [];

    // Fila única (lado a lado horizontal)
    if (distType === 'row' || distType === 'auto') {
        allProposals = allProposals.concat(findRowCombinations(targetW, targetH, maxPanes, allowRotation, tolerance, inventory));
    }
    // Columna única (apilados verticalmente)
    if (distType === 'column' || distType === 'auto') {
        allProposals = allProposals.concat(findColumnCombinations(targetW, targetH, maxPanes, allowRotation, tolerance, inventory));
    }
    // Dos filas apiladas
    if (distType === 'two-rows' || distType === 'auto') {
        allProposals = allProposals.concat(findTwoRowsCombinations(targetW, targetH, maxPanes, allowRotation, tolerance, inventory));
    }
    // Cuadrícula R x C
    if (distType === 'grid' || distType === 'auto') {
        allProposals = allProposals.concat(findGridCombinations(targetW, targetH, maxPanes, allowRotation, tolerance, inventory));
    }

    // Deduplicar propuestas por estructura de filas
    const uniqueProposals = [];
    const seenLayouts = new Set();

    allProposals.forEach(prop => {
        const rowKeys = prop.rows.map(row => row.map(p => p.id).join(','));
        const layoutKey = prop.type + '|' + rowKeys.join(';');
        
        if (!seenLayouts.has(layoutKey)) {
            seenLayouts.add(layoutKey);
            uniqueProposals.push(prop);
        }
    });

    // Puntuación
    uniqueProposals.forEach(prop => {
        prop.areaCovered = (prop.totalWidth * prop.totalHeight) / 10000; // m2
        prop.unitCount = prop.panes.length;
        
        const pricing = getCartPricing(prop.unitCount);
        prop.totalPrice = prop.unitCount * pricing.unitPrice;
        
        const wDiff = Math.abs(prop.widthDiff);
        const hDiff = Math.abs(prop.heightDiff);
        
        // Stock minimo de los productos usados
        const minStock = Math.min(...prop.panes.map(p => p.product.unidades));

        // Sub-scores para las alternativas
        prop.scoreJoints = prop.unitCount; 
        prop.scoreCoverage = -prop.areaCovered; 
        prop.scoreGaps = wDiff + hDiff; 
        prop.scoreStock = -minStock; 

        // Cálculo de score según prioridad seleccionada
        if (priority === 'joints') {
            prop.score = prop.unitCount * 2.0 + (wDiff + hDiff) * 0.5;
        } else if (priority === 'coverage') {
            prop.score = -prop.areaCovered * 100 + prop.unitCount * 0.15 + (wDiff + hDiff) * 0.2;
        } else if (priority === 'gaps') {
            prop.score = (wDiff + hDiff) * 2.0 + prop.unitCount * 0.15;
        } else if (priority === 'stock') {
            prop.score = -minStock * 0.5 + (wDiff + hDiff) * 1.0 + prop.unitCount * 0.15;
        } else {
            prop.score = (wDiff + hDiff) * 1.5 + prop.unitCount * 0.5;
        }
    });

    // Selección de las 3 alternativas distintas
    const selected = [];

    // 1. Mejor alternativa general
    uniqueProposals.sort((a, b) => a.score - b.score);
    if (uniqueProposals.length > 0) {
        selected.push({
            rankTitle: 'Mejor alternativa general',
            proposal: uniqueProposals[0]
        });
    }

    function isAlreadySelected(prop) {
        return selected.some(s => {
            const rowKeysS = s.proposal.rows.map(row => row.map(p => p.id).join(',')).join(';');
            const rowKeysP = prop.rows.map(row => row.map(p => p.id).join(',')).join(';');
            return s.proposal.type === prop.type && rowKeysS === rowKeysP;
        });
    }

    // 2. Alternativa con menos uniones
    const sortedJoints = [...uniqueProposals].sort((a, b) => {
        if (a.scoreJoints !== b.scoreJoints) return a.scoreJoints - b.scoreJoints;
        return a.scoreGaps - b.scoreGaps;
    });
    
    let jointsProp = sortedJoints.find(p => !isAlreadySelected(p));
    if (jointsProp) {
        selected.push({
            rankTitle: 'Alternativa con menos uniones',
            proposal: jointsProp
        });
    }

    // 3. Alternativa con mejor cobertura
    const sortedCoverage = [...uniqueProposals].sort((a, b) => {
        if (Math.abs(a.scoreCoverage - b.scoreCoverage) > 0.001) return a.scoreCoverage - b.scoreCoverage;
        return a.scoreGaps - b.scoreGaps;
    });

    let coverageProp = sortedCoverage.find(p => !isAlreadySelected(p));
    if (coverageProp) {
        selected.push({
            rankTitle: 'Alternativa con mejor cobertura',
            proposal: coverageProp
        });
    }

    // Si aún nos faltan alternativas distintas, rellenar de la lista general
    if (selected.length < 3 && uniqueProposals.length > selected.length) {
        uniqueProposals.forEach(p => {
            if (selected.length < 3 && !isAlreadySelected(p)) {
                selected.push({
                    rankTitle: `Alternativa de stock`,
                    proposal: p
                });
            }
        });
    }

    return selected;
}

// Búsqueda de una fila
function findRowCombinations(targetW, targetH, maxPanes, allowRotation, tolerance, inventory) {
    const availableItems = inventory.filter(item => item.unidades > 0);
    const eligibleHeights = new Set();
    availableItems.forEach(item => {
        if (Math.abs(item.alto_cm - targetH) <= tolerance) eligibleHeights.add(item.alto_cm);
        if (allowRotation && Math.abs(item.ancho_cm - targetH) <= tolerance) eligibleHeights.add(item.ancho_cm);
    });

    const results = [];
    const maxCols = Math.min(maxPanes, 6); // Límite de columnas: 6

    eligibleHeights.forEach(h => {
        const eligibleProducts = [];
        availableItems.forEach(item => {
            let matchesNormal = Math.abs(item.alto_cm - h) < 0.01;
            let matchesRotated = allowRotation && Math.abs(item.ancho_cm - h) < 0.01;

            if (matchesNormal) {
                eligibleProducts.push({
                    product: item,
                    width: item.ancho_cm,
                    height: item.alto_cm,
                    rotated: false,
                    id: `${item.id}-N`
                });
            }
            if (matchesRotated && Math.abs(item.ancho_cm - item.alto_cm) > 0.01) {
                eligibleProducts.push({
                    product: item,
                    width: item.alto_cm,
                    height: item.ancho_cm,
                    rotated: true,
                    id: `${item.id}-R`
                });
            }
        });

        if (eligibleProducts.length === 0) return;

        function dfs(index, currentCombo, currentSum, productUsage) {
            const diff = currentSum - targetW;
            if (Math.abs(diff) <= tolerance && currentCombo.length >= 1 && currentCombo.length <= maxCols) {
                results.push({
                    type: 'row',
                    rows: [[...currentCombo]],
                    totalWidth: currentSum,
                    totalHeight: h,
                    widthDiff: diff,
                    heightDiff: h - targetH,
                    panes: [...currentCombo]
                });
            }

            if (currentCombo.length >= maxCols || currentSum > targetW + tolerance) {
                return;
            }

            for (let i = index; i < eligibleProducts.length; i++) {
                const ep = eligibleProducts[i];
                const pId = ep.product.id;
                const used = productUsage[pId] || 0;

                if (used < ep.product.unidades) {
                    productUsage[pId] = used + 1;
                    currentCombo.push(ep);
                    dfs(i, currentCombo, currentSum + ep.width, productUsage);
                    currentCombo.pop();
                    productUsage[pId] = used;
                }
            }
        }

        dfs(0, [], 0, {});
    });

    return results;
}

// Búsqueda de una columna (pila única)
function findColumnCombinations(targetW, targetH, maxPanes, allowRotation, tolerance, inventory) {
    const availableItems = inventory.filter(item => item.unidades > 0);
    const eligibleWidths = new Set();
    availableItems.forEach(item => {
        if (Math.abs(item.ancho_cm - targetW) <= tolerance) eligibleWidths.add(item.ancho_cm);
        if (allowRotation && Math.abs(item.alto_cm - targetW) <= tolerance) eligibleWidths.add(item.alto_cm);
    });

    const results = [];
    const maxRows = Math.min(maxPanes, 3); // Límite de filas: 3

    eligibleWidths.forEach(w => {
        const eligibleProducts = [];
        availableItems.forEach(item => {
            let matchesNormal = Math.abs(item.ancho_cm - w) < 0.01;
            let matchesRotated = allowRotation && Math.abs(item.alto_cm - w) < 0.01;

            if (matchesNormal) {
                eligibleProducts.push({
                    product: item,
                    width: item.ancho_cm,
                    height: item.alto_cm,
                    rotated: false,
                    id: `${item.id}-N`
                });
            }
            if (matchesRotated && Math.abs(item.ancho_cm - item.alto_cm) > 0.01) {
                eligibleProducts.push({
                    product: item,
                    width: item.alto_cm,
                    height: item.ancho_cm,
                    rotated: true,
                    id: `${item.id}-R`
                });
            }
        });

        if (eligibleProducts.length === 0) return;

        function dfs(index, currentCombo, currentSum, productUsage) {
            const diff = currentSum - targetH;
            if (Math.abs(diff) <= tolerance && currentCombo.length >= 1 && currentCombo.length <= maxRows) {
                const rowsStruct = currentCombo.map(pane => [pane]);
                results.push({
                    type: 'column',
                    rows: rowsStruct,
                    totalWidth: w,
                    totalHeight: currentSum,
                    widthDiff: w - targetW,
                    heightDiff: diff,
                    panes: [...currentCombo]
                });
            }

            if (currentCombo.length >= maxRows || currentSum > targetH + tolerance) {
                return;
            }

            for (let i = index; i < eligibleProducts.length; i++) {
                const ep = eligibleProducts[i];
                const pId = ep.product.id;
                const used = productUsage[pId] || 0;

                if (used < ep.product.unidades) {
                    productUsage[pId] = used + 1;
                    currentCombo.push(ep);
                    dfs(i, currentCombo, currentSum + ep.height, productUsage);
                    currentCombo.pop();
                    productUsage[pId] = used;
                }
            }
        }

        dfs(0, [], 0, {});
    });

    return results;
}

// Búsqueda de dos filas
function findTwoRowsCombinations(targetW, targetH, maxPanes, allowRotation, tolerance, inventory) {
    const availableItems = inventory.filter(item => item.unidades > 0);
    const uniqueHeights = new Set();
    availableItems.forEach(item => {
        uniqueHeights.add(item.alto_cm);
        if (allowRotation) uniqueHeights.add(item.ancho_cm);
    });

    const heightsList = Array.from(uniqueHeights);
    const validPairs = [];
    
    for (let i = 0; i < heightsList.length; i++) {
        for (let j = i; j < heightsList.length; j++) {
            const h1 = heightsList[i];
            const h2 = heightsList[j];
            if (Math.abs(h1 + h2 - targetH) <= tolerance) {
                validPairs.push([h1, h2]);
                if (h1 !== h2) validPairs.push([h2, h1]);
            }
        }
    }

    const results = [];
    const widthCombosByHeight = {};

    function getWidthCombosForHeight(h) {
        if (widthCombosByHeight[h] !== undefined) return widthCombosByHeight[h];

        const eligibleProducts = [];
        availableItems.forEach(item => {
            let matchesNormal = Math.abs(item.alto_cm - h) < 0.01;
            let matchesRotated = allowRotation && Math.abs(item.ancho_cm - h) < 0.01;

            if (matchesNormal) {
                eligibleProducts.push({
                    product: item,
                    width: item.ancho_cm,
                    height: item.alto_cm,
                    rotated: false,
                    id: `${item.id}-N`
                });
            }
            if (matchesRotated && Math.abs(item.ancho_cm - item.alto_cm) > 0.01) {
                eligibleProducts.push({
                    product: item,
                    width: item.alto_cm,
                    height: item.ancho_cm,
                    rotated: true,
                    id: `${item.id}-R`
                });
            }
        });

        if (eligibleProducts.length === 0) {
            widthCombosByHeight[h] = [];
            return [];
        }

        const combos = [];
        const maxCols = Math.min(maxPanes - 1, 6); // Reservar al menos 1 panel para la otra fila

        function dfs(index, currentCombo, currentSum, productUsage) {
            const diff = currentSum - targetW;
            if (Math.abs(diff) <= tolerance && currentCombo.length >= 1 && currentCombo.length <= maxCols) {
                combos.push({
                    panes: [...currentCombo],
                    width: currentSum,
                    usage: { ...productUsage }
                });
            }

            if (currentCombo.length >= maxCols || currentSum > targetW + tolerance) {
                return;
            }

            for (let i = index; i < eligibleProducts.length; i++) {
                const ep = eligibleProducts[i];
                const pId = ep.product.id;
                const used = productUsage[pId] || 0;

                if (used < ep.product.unidades) {
                    productUsage[pId] = used + 1;
                    currentCombo.push(ep);
                    dfs(i, currentCombo, currentSum + ep.width, productUsage);
                    currentCombo.pop();
                    productUsage[pId] = used;
                }
            }
        }

        dfs(0, [], 0, {});
        widthCombosByHeight[h] = combos;
        return combos;
    }

    validPairs.forEach(([h1, h2]) => {
        const combos1 = getWidthCombosForHeight(h1);
        const combos2 = getWidthCombosForHeight(h2);

        if (combos1.length === 0 || combos2.length === 0) return;

        combos1.forEach(c1 => {
            combos2.forEach(c2 => {
                const totalPanes = c1.panes.length + c2.panes.length;
                if (totalPanes > maxPanes) return;

                // Validar stock total sumando ambas filas
                let stockOk = true;
                const combinedUsage = {};
                
                for (const [pId, qty] of Object.entries(c1.usage)) {
                    combinedUsage[pId] = (combinedUsage[pId] || 0) + qty;
                }
                for (const [pId, qty] of Object.entries(c2.usage)) {
                    combinedUsage[pId] = (combinedUsage[pId] || 0) + qty;
                }

                for (const [pId, qty] of Object.entries(combinedUsage)) {
                    const product = availableItems.find(p => p.id === pId);
                    if (!product || qty > product.unidades) {
                        stockOk = false;
                        break;
                    }
                }

                if (stockOk) {
                    const panesList = [...c1.panes, ...c2.panes];
                    results.push({
                        type: 'two-rows',
                        rows: [c1.panes, c2.panes],
                        totalWidth: Math.max(c1.width, c2.width),
                        totalHeight: h1 + h2,
                        widthDiff: Math.max(c1.width, c2.width) - targetW,
                        heightDiff: (h1 + h2) - targetH,
                        panes: panesList
                    });
                }
            });
        });
    });

    return results;
}

// Búsqueda de cuadrícula R x C
function findGridCombinations(targetW, targetH, maxPanes, allowRotation, tolerance, inventory) {
    const availableItems = inventory.filter(item => item.unidades > 0);
    const results = [];

    availableItems.forEach(item => {
        checkGrid(item, item.ancho_cm, item.alto_cm, false);
        if (allowRotation && Math.abs(item.ancho_cm - item.alto_cm) > 0.01) {
            checkGrid(item, item.alto_cm, item.ancho_cm, true);
        }
    });

    function checkGrid(item, w_p, h_p, rotated) {
        // Límite de filas: 3, Límite de columnas: 6, Límite máx. de paneles: 8
        for (let r = 1; r <= 3; r++) {
            for (let c = 1; c <= 6; c++) {
                const totalPanes = r * c;
                if (totalPanes > maxPanes) continue;
                if (totalPanes > item.unidades) continue; 

                const gridW = c * w_p;
                const gridH = r * h_p;

                if (Math.abs(gridW - targetW) <= tolerance && Math.abs(gridH - targetH) <= tolerance) {
                    const rowsStruct = [];
                    const paneObj = {
                        product: item,
                        width: w_p,
                        height: h_p,
                        rotated: rotated,
                        id: `${item.id}-${rotated ? 'R' : 'N'}`
                    };

                    for (let rowIdx = 0; rowIdx < r; rowIdx++) {
                        const rowPanes = [];
                        for (let colIdx = 0; colIdx < c; colIdx++) {
                            rowPanes.push(paneObj);
                        }
                        rowsStruct.push(rowPanes);
                    }

                    const panesList = Array(totalPanes).fill(paneObj);

                    results.push({
                        type: 'grid',
                        rows: rowsStruct,
                        totalWidth: gridW,
                        totalHeight: gridH,
                        widthDiff: gridW - targetW,
                        heightDiff: gridH - targetH,
                        panes: panesList
                    });
                }
            }
        }
    }

    return results;
}

// Renderizar propuestas en UI
function renderPlannerProposals(alternatives, targetW, targetH, container) {
    if (alternatives.length === 0) {
        container.innerHTML = `
            <div class="calc-no-results">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="15" y1="9" x2="9" y2="15"></line>
                    <line x1="9" y1="9" x2="15" y2="15"></line>
                </svg>
                <h3>Sin combinaciones disponibles</h3>
                <p>No encontramos una combinación cercana con el stock actual. Puedes revisar medidas similares o solicitar una cotización.</p>
                <div class="calc-no-results-actions">
                    <button onclick="quotePlannerFallback(${targetW}, ${targetH})" class="calc-btn" style="background-color: var(--color-olive); color: white; border: none; padding: 12px 24px; border-radius: 8px; font-weight: bold; cursor: pointer;">Cotizar</button>
                </div>
            </div>
        `;
        return;
    }

    container.innerHTML = '';

    const grid = document.createElement('div');
    grid.className = 'planner-proposals-grid';

    alternatives.forEach((alt) => {
        const prop = alt.proposal;
        const card = document.createElement('div');
        card.className = 'proposal-card';

        // Detalle de cantidades agrupadas
        const productCounts = {};
        prop.panes.forEach(pane => {
            const key = pane.product.id + (pane.rotated ? '_R' : '_N');
            if (!productCounts[key]) {
                productCounts[key] = {
                    product: pane.product,
                    width: pane.width,
                    height: pane.height,
                    rotated: pane.rotated,
                    qty: 0
                };
            }
            productCounts[key].qty++;
        });

        let productsListHtml = '';
        Object.values(productCounts).forEach(item => {
            const rotText = item.rotated ? ' (Girado)' : '';
            productsListHtml += `
                <li>
                    <span>${item.qty} u × ${item.product.medida_cm}${rotText}</span>
                    <strong>Stock: ${item.product.unidades} u</strong>
                </li>
            `;
        });

        const wDiffSymbol = prop.widthDiff >= 0 ? '+' : '';
        const hDiffSymbol = prop.heightDiff >= 0 ? '+' : '';
        
        const wDiffText = prop.widthDiff === 0 ? 'Exacto' : `${wDiffSymbol}${prop.widthDiff.toFixed(1)} cm`;
        const hDiffText = prop.heightDiff === 0 ? 'Exacto' : `${hDiffSymbol}${prop.heightDiff.toFixed(1)} cm`;

        const pricing = getCartPricing(prop.unitCount);
        const unitPriceText = `$${pricing.unitPrice.toLocaleString('es-CL')}`;
        const totalPriceText = `$${prop.totalPrice.toLocaleString('es-CL')}`;

        // Obtener etiqueta de tipo de distribución
        let layoutLabel = '';
        let layoutBreakdown = '';
        
        if (prop.type === 'row') {
            layoutLabel = 'Una fila horizontal';
            layoutBreakdown = `1 fila × ${prop.rows[0].length} columnas`;
        } else if (prop.type === 'column') {
            layoutLabel = 'Columna única';
            layoutBreakdown = `${prop.rows.length} filas × 1 columna`;
        } else if (prop.type === 'grid') {
            layoutLabel = 'Cuadrícula';
            layoutBreakdown = `${prop.rows.length} filas × ${prop.rows[0].length} columnas`;
        } else if (prop.type === 'two-rows') {
            const r1 = prop.rows[0];
            const r2 = prop.rows[1];
            if (r1.length === r2.length && r1.every((p, idx) => p.product.id === r2[idx].product.id)) {
                layoutLabel = 'Dos filas';
            } else {
                layoutLabel = 'Distribución combinada';
            }
            layoutBreakdown = `2 filas (Fila 1: ${r1.length} cols, Fila 2: ${r2.length} cols)`;
        }

        const svgHtml = generateProposalSvg(prop, targetW, targetH);
        const serializedProposal = encodeURIComponent(JSON.stringify(prop));

        card.innerHTML = `
            <div class="proposal-header">
                <span class="proposal-title">${alt.rankTitle}</span>
                <span class="proposal-rank" style="background-color: ${alt.rankTitle.includes('general') ? 'var(--color-olive)' : '#64748b'};">${layoutLabel}</span>
            </div>
            
            <div class="proposal-body">
                <div class="proposal-info-panel">
                    <ul class="proposal-info-list">
                        <li>
                            <span>Espacio requerido:</span>
                            <strong>${targetW} × ${targetH} cm</strong>
                        </li>
                        <li>
                            <span>Espacio cubierto:</span>
                            <strong>${prop.totalWidth.toFixed(1)} × ${prop.totalHeight.toFixed(1)} cm</strong>
                        </li>
                        <li>
                            <span>Diferencia en ancho:</span>
                            <strong style="color: ${prop.widthDiff === 0 ? 'var(--color-olive)' : '#b45309'};">${wDiffText}</strong>
                        </li>
                        <li>
                            <span>Diferencia en alto:</span>
                            <strong style="color: ${prop.heightDiff === 0 ? 'var(--color-olive)' : '#b45309'};">${hDiffText}</strong>
                        </li>
                        <li>
                            <span>Estructura de paños:</span>
                            <strong>${layoutBreakdown}</strong>
                        </li>
                        <li>
                            <span>Total cristales:</span>
                            <strong>${prop.unitCount} paños</strong>
                        </li>
                        <li>
                            <span>Superficie cubierta:</span>
                            <strong>${prop.areaCovered.toFixed(2)} m²</strong>
                        </li>
                    </ul>
                    
                    <div style="margin-top: 15px; padding-top: 12px; border-top: 1px solid rgba(0,0,0,0.05);">
                        <h4 style="font-size: 0.8rem; text-transform: uppercase; color: var(--color-text-muted); margin-bottom: 8px;">Detalle de cristales:</h4>
                        <ul class="proposal-info-list" style="gap: 5px;">
                            ${productsListHtml}
                        </ul>
                    </div>

                    <div class="proposal-price-tag">
                        <span style="font-size: 0.85rem; font-weight: 500; color: var(--color-text-muted);">Valor estimado:</span>
                        <span>${totalPriceText} <span style="font-size: 0.75rem; font-weight: 500; color: var(--color-text-muted);">(${unitPriceText} c/u)</span></span>
                    </div>
                </div>

                <div class="proposal-visualizer">
                    <h4>Vista referencial de cobertura</h4>
                    <div class="svg-viewport-wrapper">
                        ${svgHtml}
                    </div>
                    
                    <div class="svg-legend">
                        <div class="legend-item">
                            <span class="legend-color panel"></span>
                            <span>Termopanel en stock</span>
                        </div>
                        <div class="legend-item">
                            <span class="legend-color remaining"></span>
                            <span>Espacio restante</span>
                        </div>
                        <div class="legend-item">
                            <span class="legend-color line"></span>
                            <span>Unión</span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="proposal-actions">
                <button class="cta-button primary-hero-btn" onclick="addProposalToCart('${serializedProposal}')" style="margin: 0; padding: 12px 20px; font-size: 0.9rem; justify-content: center; width: 100%;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;">
                        <circle cx="9" cy="21" r="1"></circle>
                        <circle cx="20" cy="21" r="1"></circle>
                        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                    </svg>
                    Agregar propuesta al carro
                </button>
                <button class="cta-button" onclick="quoteProposalOnWhatsApp('${serializedProposal}')" style="margin: 0; padding: 12px 20px; font-size: 0.9rem; justify-content: center; width: 100%; background-color: var(--color-olive); color: white;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                        <polyline points="22,6 12,13 2,6"></polyline>
                    </svg>
                    Cotizar
                </button>
            </div>
        `;
        grid.appendChild(card);
    });

    container.appendChild(grid);
}

// Dibujar SVG dinámicamente v2
function generateProposalSvg(prop, targetW, targetH) {
    const canvasW = 340;
    const canvasH = 220;
    const paddingX = 30;
    const paddingY = 30;

    const fitW = canvasW - (paddingX * 2);
    const fitH = canvasH - (paddingY * 2);
    
    const maxW = Math.max(targetW, prop.totalWidth);
    const maxH = Math.max(targetH, prop.totalHeight);
    
    const k_scale = Math.min(fitW / maxW, fitH / maxH);

    const outerW = targetW * k_scale;
    const outerH = targetH * k_scale;
    
    let svg = `<svg width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <pattern id="diagonalHatch" width="8" height="8" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
                <line x1="0" y1="0" x2="0" y2="8" style="stroke:#e2e8f0; stroke-width:3" />
            </pattern>
        </defs>
    `;

    // 1. Dibujar el vano total (con fondo de patrón rayado)
    svg += `
        <!-- Vano total requerido -->
        <rect x="${paddingX}" y="${paddingY}" width="${outerW}" height="${outerH}" fill="url(#diagonalHatch)" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="4,4" />
    `;

    // 2. Dibujar termopaneles propuestos
    const y_bottom = paddingY + outerH;
    const stackH_pixel = prop.totalHeight * k_scale;
    const y_top = y_bottom - stackH_pixel;

    if (prop.type === 'row') {
        let currentX = paddingX;
        prop.rows[0].forEach((pane, idx) => {
            const paneW = pane.width * k_scale;
            const paneH = pane.height * k_scale;
            const paneY = y_bottom - paneH;
            
            svg += `
                <rect x="${currentX}" y="${paneY}" width="${paneW}" height="${paneH}" fill="#e0f2fe" stroke="#0284c7" stroke-width="1.5" rx="3" />
            `;
            
            const textX = currentX + (paneW / 2);
            const textY = paneY + (paneH / 2);
            drawPaneLabel(textX, textY, paneW, pane, idx + 1);

            if (idx > 0) {
                svg += `<line x1="${currentX}" y1="${y_top}" x2="${currentX}" y2="${y_bottom}" stroke="#334155" stroke-dasharray="2,2" stroke-width="1.2" />`;
            }
            currentX += paneW;
        });
    } 
    else if (prop.type === 'column') {
        let currentY = y_top;
        prop.rows.forEach((rowPanes, idx) => {
            const pane = rowPanes[0];
            const paneW = pane.width * k_scale;
            const paneH = pane.height * k_scale;
            
            svg += `
                <rect x="${paddingX}" y="${currentY}" width="${paneW}" height="${paneH}" fill="#e0f2fe" stroke="#0284c7" stroke-width="1.5" rx="3" />
            `;
            
            const textX = paddingX + (paneW / 2);
            const textY = currentY + (paneH / 2);
            drawPaneLabel(textX, textY, paneW, pane, idx + 1);

            if (idx > 0) {
                svg += `<line x1="${paddingX}" y1="${currentY}" x2="${paddingX + paneW}" y2="${currentY}" stroke="#334155" stroke-dasharray="2,2" stroke-width="1.2" />`;
            }
            currentY += paneH;
        });
    }
    else if (prop.type === 'two-rows') {
        const h1 = prop.rows[0][0].height; 
        const h2 = prop.rows[1][0].height; 
        const h1_pixel = h1 * k_scale;
        const h2_pixel = h2 * k_scale;
        
        // Fila 1 (superior)
        let currentX1 = paddingX;
        prop.rows[0].forEach((pane, idx) => {
            const paneW = pane.width * k_scale;
            svg += `
                <rect x="${currentX1}" y="${y_top}" width="${paneW}" height="${h1_pixel}" fill="#e0f2fe" stroke="#0284c7" stroke-width="1.5" rx="3" />
            `;
            drawPaneLabel(currentX1 + paneW/2, y_top + h1_pixel/2, paneW, pane, `1-${idx+1}`);
            if (idx > 0) {
                svg += `<line x1="${currentX1}" y1="${y_top}" x2="${currentX1}" y2="${y_top + h1_pixel}" stroke="#334155" stroke-dasharray="2,2" stroke-width="1.2" />`;
            }
            currentX1 += paneW;
        });

        // Fila 2 (inferior)
        let currentX2 = paddingX;
        const y2 = y_top + h1_pixel;
        prop.rows[1].forEach((pane, idx) => {
            const paneW = pane.width * k_scale;
            svg += `
                <rect x="${currentX2}" y="${y2}" width="${paneW}" height="${h2_pixel}" fill="#e0f2fe" stroke="#0284c7" stroke-width="1.5" rx="3" />
            `;
            drawPaneLabel(currentX2 + paneW/2, y2 + h2_pixel/2, paneW, pane, `2-${idx+1}`);
            if (idx > 0) {
                svg += `<line x1="${currentX2}" y1="${y2}" x2="${currentX2}" y2="${y2 + h2_pixel}" stroke="#334155" stroke-dasharray="2,2" stroke-width="1.2" />`;
            }
            currentX2 += paneW;
        });

        // Unión horizontal entre filas
        svg += `<line x1="${paddingX}" y1="${y2}" x2="${paddingX + Math.max(currentX1, currentX2) - paddingX}" y2="${y2}" stroke="#334155" stroke-dasharray="2,2" stroke-width="1.2" />`;
    }
    else if (prop.type === 'grid') {
        const R = prop.rows.length;
        const C = prop.rows[0].length;
        const pane = prop.rows[0][0];
        const paneW = pane.width * k_scale;
        const paneH = pane.height * k_scale;

        for (let r = 0; r < R; r++) {
            const currentY = y_top + r * paneH;
            for (let c = 0; c < C; c++) {
                const currentX = paddingX + c * paneW;
                svg += `
                    <rect x="${currentX}" y="${currentY}" width="${paneW}" height="${paneH}" fill="#e0f2fe" stroke="#0284c7" stroke-width="1.5" rx="3" />
                `;
                drawPaneLabel(currentX + paneW/2, currentY + paneH/2, paneW, pane, `${r+1}-${c+1}`);
                
                if (c > 0) {
                    svg += `<line x1="${currentX}" y1="${currentY}" x2="${currentX}" y2="${currentY + paneH}" stroke="#334155" stroke-dasharray="2,2" stroke-width="1.2" />`;
                }
            }
            if (r > 0) {
                svg += `<line x1="${paddingX}" y1="${currentY}" x2="${paddingX + C * paneW}" y2="${currentY}" stroke="#334155" stroke-dasharray="2,2" stroke-width="1.2" />`;
            }
        }
    }

    function drawPaneLabel(x, y, paneW_pixel, pane, rank) {
        if (paneW_pixel > 35) {
            svg += `
                <text x="${x}" y="${y - 4}" font-size="8" font-weight="700" fill="#0369a1" text-anchor="middle" dominant-baseline="middle">${pane.product.ancho_cm}×${pane.product.alto_cm}</text>
                <text x="${x}" y="${y + 6}" font-size="7" font-weight="600" fill="#0284c7" text-anchor="middle" dominant-baseline="middle">cm${pane.rotated ? ' (G)' : ''}</text>
            `;
        } else {
            svg += `
                <text x="${x}" y="${y}" font-size="8" font-weight="700" fill="#0369a1" text-anchor="middle" dominant-baseline="middle">${rank}</text>
            `;
        }
    }

    // 3. Dimensiones y acotaciones
    const labelW_X = paddingX + (outerW / 2);
    const labelW_Y = paddingY + outerH + 18;
    svg += `<text x="${labelW_X}" y="${labelW_Y}" font-size="9" font-weight="700" fill="#475569" text-anchor="middle">Vano: ${targetW} cm</text>`;
    
    const labelH_X = paddingX - 10;
    const labelH_Y = paddingY + (outerH / 2);
    svg += `<text x="${labelH_X}" y="${labelH_Y}" font-size="9" font-weight="700" fill="#475569" text-anchor="middle" transform="rotate(-90 ${labelH_X} ${labelH_Y})">Vano: ${targetH} cm</text>`;

    const covW_X = paddingX + ((prop.totalWidth * k_scale) / 2);
    const covW_Y = paddingY - 10;
    svg += `<text x="${covW_X}" y="${covW_Y}" font-size="9" font-weight="700" fill="#0284c7" text-anchor="middle">Cubierto: ${prop.totalWidth.toFixed(1)} cm</text>`;

    if (prop.totalWidth < targetW) {
        const remW = targetW - prop.totalWidth;
        const remW_pixel = remW * k_scale;
        const remX = paddingX + (prop.totalWidth * k_scale) + (remW_pixel / 2);
        const remY = paddingY + (outerH / 2);
        svg += `<text x="${remX}" y="${remY}" font-size="8" font-weight="700" fill="#64748b" text-anchor="middle" transform="rotate(-90 ${remX} ${remY})">Faltan ${remW.toFixed(1)} cm</text>`;
    }

    if (prop.totalHeight < targetH) {
        const remH = targetH - prop.totalHeight;
        const remH_pixel = remH * k_scale;
        const remX = paddingX + ((prop.totalWidth * k_scale) / 2);
        const remY = paddingY + (remH_pixel / 2);
        svg += `<text x="${remX}" y="${remY}" font-size="8" font-weight="700" fill="#64748b" text-anchor="middle">Faltan ${remH.toFixed(1)} cm de alto</text>`;
    }

    svg += `</svg>`;
    return svg;
}

// Agregar propuesta al carro de compras v2
window.addProposalToCart = function(serializedProposal) {
    try {
        const prop = JSON.parse(decodeURIComponent(serializedProposal));
        
        const productCounts = {};
        prop.panes.forEach(pane => {
            const key = pane.product.id;
            if (!productCounts[key]) {
                productCounts[key] = {
                    product: pane.product,
                    qty: 0
                };
            }
            productCounts[key].qty++;
        });

        let addedCount = 0;
        let errors = [];

        Object.values(productCounts).forEach(item => {
            const p = item.product;
            const cartItem = appState.cart.find(ci => ci.id === p.id);
            const currentQtyInCart = cartItem ? cartItem.qty : 0;
            
            if (currentQtyInCart + item.qty > p.unidades) {
                errors.push(`Medida ${p.medida_cm}: No hay suficiente stock (En carro: ${currentQtyInCart}, Solicitado: +${item.qty}, Disponible: ${p.unidades}).`);
            } else {
                if (cartItem) {
                    cartItem.qty += item.qty;
                } else {
                    appState.cart.push({
                        id: p.id,
                        ancho_cm: p.ancho_cm,
                        alto_cm: p.alto_cm,
                        medida_cm: p.medida_cm,
                        forma: p.forma,
                        qty: item.qty,
                        maxQty: p.unidades
                    });
                }
                addedCount += item.qty;
            }
        });

        if (errors.length > 0) {
            alert(`Algunas medidas no se pudieron agregar por límite de stock:\n\n${errors.join('\n')}\n\nSe agregaron las demás unidades exitosamente.`);
        } else {
            alert(`¡Se agregaron con éxito las ${addedCount} unidades de la propuesta al carro de compras!`);
        }

        saveCart();
        updateCartUI();
        openCart(true);
    } catch (e) {
        console.error('Error al agregar propuesta al carro:', e);
    }
};

// Cotizar propuesta en WhatsApp v2
window.quoteProposalOnWhatsApp = async function(serializedProposal) {
    try {
        const prop = JSON.parse(decodeURIComponent(serializedProposal));
        
        const email = prompt("Por favor, ingresa tu correo electrónico para recibir la cotización de esta propuesta:");
        if (email === null) return;
        const cleanEmail = email.trim();
        if (!cleanEmail) {
            alert("Debes ingresar un correo electrónico.");
            return;
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(cleanEmail)) {
            alert("Por favor, ingresa un correo electrónico válido.");
            return;
        }

        const itemsPayload = prop.panes.map(pane => ({
            ancho_cm: pane.product.ancho_cm,
            alto_cm: pane.product.alto_cm,
            qty: 1
        }));

        const response = await fetch('https://javicarrizo.app.n8n.cloud/webhook/cotizar-termopanel', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                items: itemsPayload,
                totalUnits: prop.unitCount,
                totalCalc: prop.totalPrice,
                email: cleanEmail,
                origen: 'planificador_propuesta'
            }),
            signal: AbortSignal.timeout(15000)
        });

        if (response.ok) {
            alert(`¡Cotización de la propuesta enviada con éxito! Revisa tu correo: ${cleanEmail}`);
        } else {
            alert("No pudimos procesar la cotización de la propuesta. Inténtalo de nuevo.");
        }
    } catch (e) {
        console.error('Error al cotizar propuesta por correo:', e);
        alert("Hubo un error de conexión al enviar la cotización. Revisa tu internet e inténtalo de nuevo.");
    }
};

window.quoteCustomClosing = async function(widthVal, heightVal) {
    const email = prompt("Por favor, ingresa tu correo electrónico para recibir la cotización personalizada:");
    if (email === null) return;
    const cleanEmail = email.trim();
    if (!cleanEmail) { 
        alert("Debes ingresar un correo electrónico."); 
        return; 
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) { 
        alert("Por favor, ingresa un correo electrónico válido."); 
        return; 
    }

    try {
        const response = await fetch('https://javicarrizo.app.n8n.cloud/webhook/cotizar-termopanel', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: `Hola, quiero cotizar un cierre a medida para un espacio de ${widthVal} cm de ancho por ${heightVal} cm de alto.`,
                email: cleanEmail,
                origen: 'asistente_dimensiones_limite'
            }),
            signal: AbortSignal.timeout(15000)
        });

        if (response.ok) {
            alert(`¡Solicitud enviada con éxito! Nos contactaremos contigo al correo: ${cleanEmail}`);
        } else {
            alert("No pudimos procesar tu solicitud. Inténtalo de nuevo.");
        }
    } catch (e) {
        console.error(e);
        alert("Error de conexión. Inténtalo de nuevo.");
    }
};

window.quotePlannerFallback = async function(targetW, targetH) {
    const email = prompt("Por favor, ingresa tu correo electrónico para recibir alternativas de stock:");
    if (email === null) return;
    const cleanEmail = email.trim();
    if (!cleanEmail) { 
        alert("Debes ingresar un correo electrónico."); 
        return; 
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) { 
        alert("Por favor, ingresa un correo electrónico válido."); 
        return; 
    }

    try {
        const response = await fetch('https://javicarrizo.app.n8n.cloud/webhook/cotizar-termopanel', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: `Hola, no encontré stock en el Planificador para ${targetW} x ${targetH} cm. ¿Tienen otras alternativas similares?`,
                email: cleanEmail,
                origen: 'planificador_sin_stock'
            }),
            signal: AbortSignal.timeout(15000)
        });

        if (response.ok) {
            alert(`¡Solicitud enviada con éxito! Te enviaremos alternativas al correo: ${cleanEmail}`);
        } else {
            alert("No pudimos procesar tu solicitud. Inténtalo de nuevo.");
        }
    } catch (e) {
        console.error(e);
        alert("Error de conexión. Inténtalo de nuevo.");
    }
};
