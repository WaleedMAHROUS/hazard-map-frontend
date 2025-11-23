/* SCRIPT.JS (V 0.6 - Client-Side Stats & Filtering) */
document.addEventListener('DOMContentLoaded', () => {
    // --- MAP INITIALIZATION ---
    const map = L.map('map', { preferCanvas: true, zoomControl: false }).setView([20, 0], 2);

    // Esri World Imagery (Satellite)
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
        maxZoom: 19
    }).addTo(map);

    // Optional: Add a dark overlay to make markers pop more on bright satellite imagery?
    // L.rectangle([[-90, -180], [90, 180]], { color: '#000', weight: 0, fillOpacity: 0.3 }).addTo(map);

    L.control.zoom({ position: 'topright' }).addTo(map);

    // --- DOM ELEMENTS ---
    const els = {
        icao: document.getElementById('icao-input'),
        lat: document.getElementById('lat-input'),
        lon: document.getElementById('lon-input'),
        radius: document.getElementById('radius-input'),
        minArea: document.getElementById('min-area-input'),
        submit: document.getElementById('submit-btn'),
        loader: document.getElementById('submit-btn-loader'),
        status: document.getElementById('status-message'),
        kml: document.getElementById('download-kml-btn'),
        csv: document.getElementById('download-csv-btn'),
        dashboard: document.getElementById('dashboard-panel'),
        dashboardToggle: document.getElementById('dashboard-toggle'),
        featureList: document.getElementById('feature-list'),
        statTotal: document.getElementById('stat-total'),
        statHighRisk: document.getElementById('stat-high-risk'),
        statArea: document.getElementById('stat-area'),
        filters: document.querySelectorAll('.form-checkbox')
    };

    // --- STATE ---
    const API_ENDPOINT = "https://hazard-map-backend.onrender.com/generate-report";
    let layerGroup = L.featureGroup();
    let allFeatures = []; // Store ALL raw features
    let currentFeatures = []; // Store FILTERED features
    let lastKML, lastCSV, mode = 'icao';
    let hazardChart = null;
    let airportInfo = null;
    let currentRadius = 13;

    // --- TABS & UI LOGIC ---
    document.getElementById('tab-icao').onclick = () => setMode('icao');
    document.getElementById('tab-coords').onclick = () => setMode('coords');

    function setMode(m) {
        mode = m;
        document.getElementById('tab-icao').className = m === 'icao' ? "flex-1 py-2 bg-brand-primary text-black font-semibold" : "flex-1 py-2 bg-brand-secondary text-gray-300 hover:bg-gray-700";
        document.getElementById('tab-coords').className = m === 'coords' ? "flex-1 py-2 bg-brand-primary text-black font-semibold" : "flex-1 py-2 bg-brand-secondary text-gray-300 hover:bg-gray-700";
        document.getElementById('panel-icao').classList.toggle('hidden', m !== 'icao');
        document.getElementById('panel-coords').classList.toggle('hidden', m === 'icao');
    }

    // Dashboard Toggle
    let isDashboardOpen = false;
    els.dashboardToggle.onclick = () => {
        isDashboardOpen = !isDashboardOpen;
        els.dashboard.classList.toggle('translate-y-full', !isDashboardOpen);
        els.dashboardToggle.querySelector('span').innerText = isDashboardOpen ? "CLOSE" : "DASHBOARD";
    };

    // About Modal
    document.getElementById('about-btn').onclick = () => document.getElementById('about-modal').classList.remove('hidden');
    document.getElementById('close-about-btn').onclick = () => document.getElementById('about-modal').classList.add('hidden');

    // Start Over
    document.getElementById('start-over-btn').onclick = () => {
        location.reload();
    };

    // --- CHART INITIALIZATION ---
    function initChart() {
        const ctx = document.getElementById('hazardChart').getContext('2d');
        hazardChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Waste', 'Water', 'Vegetation', 'Other'],
                datasets: [{
                    data: [0, 0, 0, 0],
                    backgroundColor: ['#8B4513', '#3B82F6', '#10B981', '#9CA3AF'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'right', labels: { color: '#fff', boxWidth: 10 } }
                }
            }
        });
    }
    initChart();

    // --- MAIN LOGIC ---
    els.submit.onclick = async () => {
        els.submit.disabled = true;
        els.loader.classList.remove('hidden');
        els.status.innerText = "Scanning... (This may take 30-60s)";
        els.status.className = "text-center text-sm mt-2 text-blue-400";

        try {
            const payload = {
                radius_km: parseFloat(els.radius.value) || 13,
                min_area_sq_m: els.minArea.value === '' ? 5000 : parseFloat(els.minArea.value),
                mode: mode,
                icao: els.icao.value,
                lat: els.lat.value,
                lon: els.lon.value
            };
            currentRadius = payload.radius_km;

            const res = await fetch(API_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Server Error");

            // Success
            lastKML = data.kml_string;
            lastCSV = data.csv_string;
            allFeatures = data.map_geojson.features;
            airportInfo = data.airport_info;

            // Initial Render (All filters active by default)
            applyFilters();

            // Show UI
            document.getElementById('filters-section').classList.remove('hidden');
            document.getElementById('downloads-section').classList.remove('hidden');

            // Open Dashboard
            if (!isDashboardOpen) els.dashboardToggle.click();

            els.status.innerText = `Found ${data.feature_count} habitats.`;
            els.status.className = "text-center text-sm mt-2 text-green-400";

        } catch (e) {
            console.error(e);
            els.status.innerText = "Error: " + e.message;
            els.status.className = "text-center text-sm mt-2 text-red-500";
        } finally {
            els.submit.disabled = false;
            els.loader.classList.add('hidden');
        }
    };

    // --- FILTERING LOGIC ---
    function applyFilters() {
        // 1. Get active filters
        const activeTypes = Array.from(els.filters)
            .filter(cb => cb.checked)
            .map(cb => cb.dataset.filter);

        // 2. Filter features
        currentFeatures = allFeatures.filter(f => {
            const t = f.properties.custom_type;
            return activeTypes.includes(t) || (t === 'other' && activeTypes.includes('waste')); // Group other with waste or separate?
        });

        // 3. Update everything
        renderMap(airportInfo, currentRadius, currentFeatures);
        updateDashboard(currentFeatures);
        renderFeatureList(currentFeatures);
    }

    // Attach listeners to filters
    els.filters.forEach(cb => cb.onchange = applyFilters);


    // --- RENDER FUNCTIONS ---
    function renderMap(arp, radiusKm, features) {
        if (layerGroup) map.removeLayer(layerGroup);
        layerGroup = L.featureGroup();

        // ARP Marker
        const arpIcon = L.divIcon({
            className: 'custom-div-icon',
            html: `<div style="background-color:#F59E0B; width:12px; height:12px; border-radius:50%; border:2px solid white;"></div>`,
            iconSize: [12, 12],
            iconAnchor: [6, 6]
        });
        L.marker([arp.lat, arp.lon], { icon: arpIcon }).addTo(layerGroup).bindPopup(`<b>ARP: ${arp.name}</b>`);

        // Radius Circle
        L.circle([arp.lat, arp.lon], {
            radius: radiusKm * 1000,
            color: '#F59E0B',
            fill: false,
            weight: 3, // Thicker for satellite visibility
            dashArray: '10, 10'
        }).addTo(layerGroup);

        // Features
        features.forEach(f => {
            const t = f.properties.custom_type;
            const risk = f.properties.risk_score || 1;
            const dist = f.properties.dist_km || 0;
            const specificName = f.properties.name || (t === 'water' ? "Water Body" : t === 'veg' ? "Vegetation" : "Waste/Industrial");

            let color = '#9CA3AF';
            if (t === 'waste') color = '#8B4513';
            if (t === 'water') color = '#3B82F6';
            if (t === 'veg') color = '#10B981';

            const layer = L.geoJSON(f, {
                style: {
                    color: color,
                    weight: risk > 7 ? 4 : 2, // Thicker lines
                    fillOpacity: 0.7 // Higher opacity
                },
                onEachFeature: (feature, layer) => {
                    layer.bindPopup(`
                        <div class="font-sans min-w-[200px]">
                            <h3 class="font-bold text-brand-primary border-b border-gray-600 pb-1 mb-2 text-sm">${specificName}</h3>
                            <div class="text-xs space-y-1">
                                <p class="flex justify-between"><b>Type:</b> <span>${t.toUpperCase()}</span></p>
                                <p class="flex justify-between"><b>Risk Score:</b> <span>${risk}/10</span></p>
                                <p class="flex justify-between"><b>Distance to ARP:</b> <span>${dist.toFixed(2)} km</span></p>
                                <p class="flex justify-between"><b>Area:</b> <span>${Math.round(feature.properties.area_sq_m).toLocaleString()} m²</span></p>
                            </div>
                        </div>
                    `);
                    feature.layer = layer;
                }
            });
            layer.addTo(layerGroup);
        });

        layerGroup.addTo(map);
        // Don't fit bounds on every filter change to avoid jumping, only if it's the first load?
        // Actually, fitting bounds is nice.
        if (features.length > 0) map.fitBounds(layerGroup.getBounds());
    }

    function updateDashboard(features) {
        // Calculate stats client-side
        const stats = {
            total_area: 0,
            by_type: { waste: 0, water: 0, veg: 0, other: 0 },
            by_risk: { High: 0, Medium: 0, Low: 0 }
        };

        features.forEach(f => {
            stats.total_area += f.properties.area_sq_m || 0;

            const t = f.properties.custom_type || 'other';
            if (stats.by_type[t] !== undefined) stats.by_type[t]++;
            else stats.by_type.other++;

            const rs = f.properties.risk_score || 1;
            if (rs >= 7) stats.by_risk.High++;
            else if (rs >= 4) stats.by_risk.Medium++;
            else stats.by_risk.Low++;
        });

        els.statTotal.innerText = features.length;
        els.statHighRisk.innerText = stats.by_risk.High;
        els.statArea.innerText = (stats.total_area / 1000000).toFixed(2);

        // Update Chart
        hazardChart.data.datasets[0].data = [
            stats.by_type.waste,
            stats.by_type.water,
            stats.by_type.veg,
            stats.by_type.other
        ];
        hazardChart.update();
    }

    function renderFeatureList(features) {
        els.featureList.innerHTML = '';

        // Sort by Risk Score (Desc)
        const sorted = [...features].sort((a, b) => (b.properties.risk_score || 0) - (a.properties.risk_score || 0));

        sorted.forEach((f, i) => {
            const t = f.properties.custom_type;
            const risk = f.properties.risk_score || 1;
            const area = f.properties.area_sq_m || 0;
            const dist = f.properties.dist_km || 0;
            const specificName = f.properties.name || t;

            const div = document.createElement('div');
            div.className = "feature-item flex justify-between items-center p-2 rounded hover:bg-gray-700 transition-colors text-xs border-b border-gray-800";

            let riskColor = "text-green-500";
            if (risk >= 4) riskColor = "text-yellow-500";
            if (risk >= 7) riskColor = "text-red-500";

            div.innerHTML = `
                <div class="w-1/3 font-semibold truncate" title="${specificName}">${specificName}</div>
                <div class="w-1/4 text-right font-bold ${riskColor}">${risk}</div>
                <div class="w-1/4 text-right text-gray-400">${dist.toFixed(2)} km</div>
                <div class="w-16 text-center">
                    <button class="text-brand-primary hover:text-white px-2 py-1 rounded border border-brand-primary text-[10px] group relative">
                        VIEW
                        <div class="hidden group-hover:block absolute right-full top-0 mr-2 w-32 bg-gray-800 text-white text-[10px] p-2 rounded z-50 border border-gray-600">
                            Fly to this habitat on the map.
                        </div>
                    </button>
                </div>
            `;

            div.querySelector('button').onclick = () => {
                if (f.layer) {
                    map.flyToBounds(f.layer.getBounds(), { maxZoom: 16 });
                    f.layer.openPopup();
                }
            };

            els.featureList.appendChild(div);
        });
    }

    // Downloads
    const download = (d, ext) => {
        // Generate filename based on mode
        let locationName = '';
        if (mode === 'icao') {
            locationName = els.icao.value.toUpperCase() || 'UNKNOWN';
        } else {
            const lat = parseFloat(els.lat.value).toFixed(2);
            const lon = parseFloat(els.lon.value).toFixed(2);
            locationName = `${lat}_${lon}`;
        }

        const date = new Date().toISOString().split('T')[0];
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([d]));
        a.download = `Habitat_Scan_${locationName}_${date}.${ext}`;
        a.click();
    };
    els.csv.onclick = () => lastCSV && download(lastCSV, 'csv');
    els.kml.onclick = () => lastKML && download(lastKML, 'kml');

});