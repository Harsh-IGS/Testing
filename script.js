// Initialize Map
var map = L.map('map').setView([37.8, -96], 4);

// Add base map
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// Global variables
let geojsonLayer;
let geojsonData;
let selectedPolygon = null;

// Fetch and process GeoJSON data
fetch('data/CGSA_ZIP_demand_mapping.geojson')
    .then(response => response.json())
    .then(data => {
        geojsonData = data;
        geojsonLayer = L.geoJson(data, {
            style: feature => ({
                fillColor: getColor(feature.properties.elec_market_size),
                weight: 1,
                color: 'white',
                fillOpacity: 0.7
            }),
            onEachFeature: onEachPolygon,
            interactive: true // Ensure this is explicitly set
        }).addTo(map);
        
        // Explicitly bring to front to ensure interaction
        geojsonLayer.bringToFront();

        map.fitBounds(geojsonLayer.getBounds());
        updateChart(null); // Initial chart with full dataset
    });

function onEachPolygon(feature, layer) {
    layer.on('click', function(e) {
        // ← STOP this click from also hitting map.on('click')
        L.DomEvent.stopPropagation(e);

        selectedPolygon = feature.properties;

        // Show the popup on the map
        L.popup({ autoPan: true })
         .setLatLng(e.latlng)
         .setContent(`
            <strong>ZIP: ${selectedPolygon.ZIP_Code}</strong><br>
            <b>Electric Market Size:</b> ${selectedPolygon.elec_market_size.toLocaleString()}<br>
            <b>Total Housing Units:</b> ${selectedPolygon['Total Housing Units'].toLocaleString()}<br>
            <b>Sparky Market Share:</b> ${(selectedPolygon.SparyMarketShare).toFixed(2)}%
         `)
         .openOn(map);

        // Update the side‐panel and chart
        updateInfoPanel(selectedPolygon);
        updateChart(selectedPolygon);
    });
}

fetch('data/CGSA_ZIP_demand_mapping.geojson')
  .then(r => r.json())
  .then(data => {
    geojsonData = data;

    // 1) grab and sort all values
    const vals = data.features.map(f => f.properties.elec_market_size);
    const sorted = vals.slice().sort((a, b) => a - b);

    // 2) decide how many classes you want
    const classCount = 6;

    // 3) compute percentile breaks (0%, 16.7%, 33.3%, …, 100%)
    const breaks = [];
    for (let i = 0; i <= classCount; i++) {
      const p = i / classCount;
      const idx = Math.floor(p * (sorted.length - 1));
      breaks.push(sorted[idx]);
    }

    // 4) your color ramp must be classCount+1 long
    const ramp = [
      '#FFEDA0','#FED976','#FEB24C',
      '#FD8D3C','#FC4E2A','#E31A1C','#BD0026'
    ];

    // 5) dynamic getColor based on percentile bins
    function getColor(d) {
      for (let i = classCount; i > 0; i--) {
        if (d >= breaks[i]) return ramp[i];
      }
      return ramp[0];
    }

    // 6) build legend off those same percentile breaks
    const legend = L.control({ position: 'bottomright' });
    legend.onAdd = map => {
        const div = L.DomUtil.create('div','info legend');
        for (let i = 0; i < breaks.length - 1; i++) {
          const rawStart = breaks[i],
                rawEnd   = breaks[i+1];
      
          // round to nearest ten-thousand
          const start = Math.round(rawStart / 100000) * 100000,
                end   = Math.round(rawEnd   / 100000) * 100000;
      
          // format with commas
          const label = `${start.toLocaleString()}&ndash;${end.toLocaleString()}`;
      
          div.innerHTML +=
            `<div class="legend-item">
               <i style="background:${ramp[i+1]}"></i>
               ${label}
             </div>`;
        }
        return div;
    };   
    legend.addTo(map);

    // 7) draw your choropleth
    if (geojsonLayer) map.removeLayer(geojsonLayer);
    geojsonLayer = L.geoJson(data, {
      style: f => ({
        fillColor: getColor(f.properties.elec_market_size),
        weight: 1, color: 'white', fillOpacity: 0.7
      }),
      onEachFeature: onEachPolygon
    }).addTo(map);

    map.fitBounds(geojsonLayer.getBounds());
    updateChart(null);
  })
  .catch(err => console.error(err));



// Show Popup with required information
function showPopup(latlng, props) {
    L.popup()
     .setLatLng(latlng)
     .setContent(`
        <strong>ZIP: ${props.ZIP_Code}</strong><br>
        <b>Electric Market Size:</b> ${props.elec_market_size.toLocaleString()}<br>
        <b>Total Housing Units:</b> ${props['Total Housing Units'].toLocaleString()}<br>
        <b>Sparky Market Share:</b> ${(props.SparyMarketShare).toFixed(2)}%
     `)
     .openOn(map);
}

// Update Info Panel
function updateInfoPanel(props) {
    document.getElementById('info-panel').innerHTML = `
        <strong>${props.zip_statename || props.ZIP_Code}</strong><br>
        Electric Market Size: ${props.elec_market_size.toLocaleString()}<br>
        Total Housing Units: ${props['Total Housing Units'].toLocaleString()}<br>
        Sparky Market Share: ${(props.SparyMarketShare).toFixed(2)}%
    `;
}

// Initialize Chart.js
var chart = new Chart(document.getElementById('chartCanvas'), {
    type: 'bar',
    data: {
        labels: ['2020+', '2010-2019', '2000-2009', '1990-1999', '1980-1989',
                 '1970-1979', '1960-1969', '1950-1959', '1940-1949', '≤1939'],
        datasets: [{
            label: 'Housing Units by Year Built',
            data: [],
            backgroundColor: '#4dc9f6'
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'top' } }
    }
});

// Update Chart Function
function updateChart(props) {
    const keys = [
        'Built 2020 or later', 'Built 2010 to 2019', 'Built 2000 to 2009',
        'Built 1990 to 1999', 'Built 1980 to 1989', 'Built 1970 to 1979',
        'Built 1960 to 1969', 'Built 1950 to 1959', 'Built 1940 to 1949',
        'Built 1939 or earlier'
    ];

    let totals = Array(keys.length).fill(0);

    if (props) {
        totals = keys.map(k => props[k]);
    } else {
        geojsonData.features.forEach(feat => {
            keys.forEach((k, i) => totals[i] += feat.properties[k]);
        });
    }

    chart.data.datasets[0].data = totals;
    chart.update();
}

// Clear selection on map click outside polygons
map.on('click', function(e) {
    map.closePopup();
    selectedPolygon = null;
    document.getElementById('info-panel').innerHTML = 'Click on map features for details';
    updateChart(null);
});
