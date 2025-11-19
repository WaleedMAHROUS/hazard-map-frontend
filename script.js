/*
 * SCRIPT.JS (Stable Version)
 */

document.addEventListener('DOMContentLoaded', () => {

    // 1. SETUP
    const map = L.map('map', { preferCanvas: true }).setView([20, 0], 2); // preferCanvas is KEY for stability
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(map);

    const inputs = {
        icao: document.getElementById('icao-input'),
        lat: document.getElementById('lat-input'),
        lon: document.getElementById('lon-input'),
        radius: document.getElementById('radius-input'),
        minArea: document.getElementById('min-area-input')
    };
    const btns = {
        submit: document.getElementById('submit-btn'),
        kml: document.getElementById('download-kml-btn'),
        csv: document.getElementById('download-csv-btn'),
        reset: document.getElementById('start-over-btn')
    };
    const status = document.getElementById('status-message');
    
    // CHANGE THIS TO YOUR RENDER URL FOR DEPLOYMENT
    const API_ENDPOINT = "https://hazard-map-backend.onrender.com/generate-report"; 
    // const API_ENDPOINT = "http://127.0.0.1:5000/generate-report"; // For Local Testing

    let currentMode = 'icao';
    let layerGroup = null;
    let lastKML = null;
    let lastCSV = null;
    let lastFilename = "report";

    // 2. TABS
    const tIcao = document.getElementById('tab-icao');
    const tCoords = document.getElementById('tab-coords');
    
    tIcao.onclick = () => {
        currentMode = 'icao';
        document.getElementById('panel-icao').classList.remove('hidden');
        document.getElementById('panel-coords').classList.add('hidden');
        tIcao.className = "w-1/2 py-2 px-4 bg-brand-primary text-black font-semibold rounded-l-lg focus:outline-none";
        tCoords.className = "w-1/2 py-2 px-4 bg-brand-secondary text-gray-300 font-semibold rounded-r-lg focus:outline-none";
    };

    tCoords.onclick = () => {
        currentMode = 'coords';
        document.getElementById('panel-coords').classList.remove('hidden');
        document.getElementById('panel-icao').classList.add('hidden');
        tCoords.className = "w-1/2 py-2 px-4 bg-brand-primary text-black font-semibold rounded-l-lg focus:outline-none";
        tIcao.className = "w-1/2 py-2 px-4 bg-brand-secondary text-gray-300 font-semibold rounded-r-lg focus:outline-none";
    };

    // 3. SUBMIT
    btns.submit.onclick = async () => {
        if(btns.submit.disabled) return;
        setLoading(true);
        status.innerHTML = "Scanning... (This takes ~45s)";
        status.className = "mt-4 text-center text-blue-400";

        const payload = {
            radius_km: parseFloat(inputs.radius.value) || 13,
            min_area_sq_m: parseFloat(inputs.minArea.value) || 5000,
            mode: currentMode
        };

        if (currentMode === 'icao') {
            payload.icao = inputs.icao.value.toUpperCase();
            lastFilename = payload.icao;
            if(payload.icao.length !== 4) { setLoading(false); return alert("ICAO must be 4 chars"); }
        } else {
            payload.lat = parseFloat(inputs.lat.value);
            payload.lon = parseFloat(inputs.lon.value);
            lastFilename = "Custom_Location";
        }

        try {
            const res = await fetch(API_ENDPOINT, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload)
            });
            
            if(!res.ok) throw new Error("Server Error");
            const data = await res.json();

            lastKML = data.kml_string;
            lastCSV = data.csv_string;
            
            drawMap(data.map_geojson, data.airport_info, payload.radius_km);
            
            status.innerHTML = `Success! Found ${data.feature_count} features.`;
            status.className = "mt-4 text-center text-green-400";
            btns.csv.disabled = false;
            btns.kml.disabled = false;

        } catch (e) {
            console.error(e);
            status.innerHTML = "Error: " + e.message;
            status.className = "mt-4 text-center text-red-500";
        } finally {
            setLoading(false);
        }
    };

    // 4. MAP DRAWING (Stable)
    function drawMap(geojson, center, radius) {
        if(layerGroup) map.removeLayer(layerGroup);
        layerGroup = L.featureGroup();

        // Draw Features
        L.geoJSON(geojson, {
            style: (f) => {
                const t = f.properties.custom_type;
                let col = '#8B4513'; // Default Brown (Waste)
                if(t === 'water') col = '#3B82F6'; // Blue
                if(t === 'veg') col = '#10B981'; // Green
                return { color: col, weight: 1, fillOpacity: 0.6 };
            },
            onEachFeature: (f, l) => {
                const area = Math.round(f.properties.area_sq_m || 0).toLocaleString();
                const type = f.properties.custom_type === 'water' ? 'Water Body' : 
                             f.properties.custom_type === 'veg' ? 'Vegetation' : 'Ind./Waste';
                l.bindPopup(`<b>${type}</b><br>Area: ${area} m²`);
            }
        }).addTo(layerGroup);

        // ARP
        const arpIcon = L.divIcon({html: '✈️', className: 'text-xl'});
        L.marker([center.lat, center.lon], {icon: arpIcon}).addTo(layerGroup).bindPopup("ARP");

        // Radius
        L.circle([center.lat, center.lon], {
            radius: radius * 1000, color: '#EF4444', fill: false, weight: 2
        }).addTo(layerGroup);

        layerGroup.addTo(map);
        map.fitBounds(layerGroup.getBounds());
    }

    // 5. UTILS
    function setLoading(b) {
        btns.submit.disabled = b;
        document.getElementById('submit-btn-loader').classList.toggle('hidden', !b);
        document.getElementById('submit-btn-text').classList.toggle('hidden', b);
    }

    function download(content, ext, type) {
        const blob = new Blob([content], {type: type});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${new Date().toISOString().split('T')[0]}_Scanned_Hazards_${lastFilename}.${ext}`;
        a.click();
    }

    btns.csv.onclick = () => download(lastCSV, 'csv', 'text/csv');
    btns.kml.onclick = () => download(lastKML, 'kml', 'application/vnd.google-earth.kml+xml');
    btns.reset.onclick = () => { 
        inputs.icao.value = ""; 
        if(layerGroup) map.removeLayer(layerGroup);
        status.innerHTML = "";
        btns.csv.disabled = true; btns.kml.disabled = true;
    };
    
    // Modal
    document.getElementById('about-btn').onclick = () => document.getElementById('about-modal').classList.remove('hidden');
    document.getElementById('close-about-btn').onclick = () => document.getElementById('about-modal').classList.add('hidden');
});