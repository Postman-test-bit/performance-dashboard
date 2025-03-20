let allData = []; // Store all data for filtering
let latestData = []; // Store latest data for filtering
let horizontalBarChart, seoChart, accessibilityChart, bestPracticeChart; // Store chart instances
let currentPage = 1; // Current page for pagination
const rowsPerPage = 10; // Number of rows per page
Chart.register(ChartDataLabels);

// Update Pagination
function updatePagination(totalPages) {
  const pagination = document.getElementById("pagination");
  pagination.innerHTML = ""; // Clear existing buttons

  const maxVisiblePages = 5; // Number of visible pages around the current page
  const ellipsisThreshold = 2; // Show ellipsis if pages are skipped

  // Function to create a pagination button
  function createPageButton(page, isActive = false) {
    const button = document.createElement("button");
    button.innerText = page;
    button.classList.add("pagination-button");
    if (isActive) {
      button.classList.add("active");
    }
    button.addEventListener("click", () => {
      currentPage = page;
      updateTable(allData);
      updatePagination(totalPages);
    });
    return button;
  }

  // Always show the first page
  pagination.appendChild(createPageButton(1, currentPage === 1));

  // Show ellipsis if current page is far from the first page
  if (currentPage > ellipsisThreshold + 1) {
    const ellipsis = document.createElement("span");
    ellipsis.innerText = "...";
    pagination.appendChild(ellipsis);
  }

  // Show pages around the current page
  const startPage = Math.max(2, currentPage - Math.floor(maxVisiblePages / 2));
  const endPage = Math.min(
    totalPages - 1,
    currentPage + Math.floor(maxVisiblePages / 2)
  );

  for (let i = startPage; i <= endPage; i++) {
    pagination.appendChild(createPageButton(i, i === currentPage));
  }

  // Show ellipsis if current page is far from the last page
  if (currentPage < totalPages - ellipsisThreshold) {
    const ellipsis = document.createElement("span");
    ellipsis.innerText = "...";
    pagination.appendChild(ellipsis);
  }

  // Always show the last page
  if (totalPages > 1) {
    pagination.appendChild(
      createPageButton(totalPages, currentPage === totalPages)
    );
  }
}

function scrollToAccessibilityChart() {
  // Get the target element
  const targetElement = document.getElementById("accessibilityChart");

  // Scroll to the target element with smooth behavior
  if (targetElement) {
    targetElement.scrollIntoView({ behavior: "smooth" });
  }
}
function scrollToSeoChart() {
  // Get the target element
  const targetElement = document.getElementById("seoChart");

  // Scroll to the target element with smooth behavior
  if (targetElement) {
    targetElement.scrollIntoView({ behavior: "smooth" });
  }
}
function scrollToBestPracticeChart() {
  // Get the target element
  const targetElement = document.getElementById("bestPracticeChart");

  // Scroll to the target element with smooth behavior
  if (targetElement) {
    targetElement.scrollIntoView({ behavior: "smooth" });
  }
}

// Dark/Light Mode Toggle
function toggleTheme() {
  const body = document.body;
  body.classList.toggle("light-mode");
  const icon = document.querySelector(".theme-toggle i");
  if (body.classList.contains("light-mode")) {
    icon.classList.replace("fa-moon", "fa-sun");
    body.style.backgroundColor = "#f4f4f4";
    body.style.color = "#333";
  } else {
    icon.classList.replace("fa-sun", "fa-moon");
    body.style.backgroundColor = "#1e1e2e";
    body.style.color = "#fff";
  }
  // Update Chart Data Labels color when theme is toggled
  [horizontalBarChart, seoChart, accessibilityChart, bestPracticeChart].forEach(
    (chart) => {
      if (chart) {
        chart.options.plugins.datalabels.color =
          document.body.classList.contains("light-mode") ? "#333" : "#fff";
        chart.update();
      }
    }
  );
}

// Fetch Data and Update Dashboard
async function fetchData() {
  try {
    const response = await fetch(
      "https://test-dashboard-66zd.onrender.com/api/data"
    );
    allData = await response.json();
    latestData = await fetchLatestData(allData);
    updateDashboard(allData);
    populateDeviceFilter(allData);
    populateSeoDeviceFilter(allData);
    populateAccessibilityDeviceFilter(allData);
    populateBestPracticeDeviceFilter(allData);
    populateTableDeviceFilter(allData); // Add this line
  } catch (error) {
    console.error("Error fetching data:", error);
  } finally {
    document.getElementById("loading").style.display = "none";
    document.getElementById("dashboard").style.display = "block";
  }
}
// Populate Device Filter Options for Performance Chart
function populateDeviceFilter(data) {
  const deviceTypes = [...new Set(data.map((d) => d.device))];
  const filter = document.getElementById("deviceFilter");
  deviceTypes.forEach((device) => {
    const option = document.createElement("option");
    option.value = device;
    option.textContent = device;
    filter.appendChild(option);
  });
}

// Populate Device Filter Options for SEO Chart
function populateSeoDeviceFilter(data) {
  const deviceTypes = [...new Set(data.map((d) => d.device))];
  const filter = document.getElementById("seoDeviceFilter");
  deviceTypes.forEach((device) => {
    const option = document.createElement("option");
    option.value = device;
    option.textContent = device;
    filter.appendChild(option);
  });
}

// Populate Device Filter Options for Accessibility Chart
function populateAccessibilityDeviceFilter(data) {
  const deviceTypes = [...new Set(data.map((d) => d.device))];
  const filter = document.getElementById("accessibilityDeviceFilter");
  deviceTypes.forEach((device) => {
    const option = document.createElement("option");
    option.value = device;
    option.textContent = device;
    filter.appendChild(option);
  });
}

async function fetchLatestData(data) {
  const latestRunResults = await Object.values(
    data.reduce((acc, test) => {
      const { scenario, created_at } = test;
      if (
        !acc[scenario] ||
        new Date(created_at) > new Date(acc[scenario].created_at)
      ) {
        acc[scenario] = test;
      }
      return acc;
    }, {})
  );
  return latestRunResults;
}
// Populate Device Filter Options for Best Practices Chart
function populateBestPracticeDeviceFilter(data) {
  const deviceTypes = [...new Set(data.map((d) => d.device))];
  const filter = document.getElementById("bestPracticeDeviceFilter");
  deviceTypes.forEach((device) => {
    const option = document.createElement("option");
    option.value = device;
    option.textContent = device;
    filter.appendChild(option);
  });
}

// Apply Filters for Performance Chart
function applyFilters() {
  const selectedDevice = document.getElementById("deviceFilter").value;
  const selectedPerformance =
    document.getElementById("performanceFilter").value;

  console.log("Selected Device:", selectedDevice);
  console.log("Selected Performance Range:", selectedPerformance);

  let filteredData = latestData;

  // Filter by Device
  if (selectedDevice !== "All") {
    filteredData = filteredData.filter((d) => d.device === selectedDevice);
    console.log("Data after device filter:", filteredData);
  }

  // Filter by Performance
  if (selectedPerformance !== "All") {
    let [min, max] = selectedPerformance.split("-").map(Number);

    // Swap min and max if the range is descending (e.g., 100-80)
    if (min > max) {
      [min, max] = [max, min]; // Swap values
    }

    console.log(`Filtering by performance: ${min} - ${max}`);
    filteredData = filteredData.filter((d) => {
      console.log(`Checking performance: ${d.performance_metrics}`);
      return d.performance_metrics >= min && d.performance_metrics <= max;
    });
    console.log("Data after performance filter:", filteredData);
  }

  console.log("Final Filtered Data:", filteredData);
  updatePerformanceChart(filteredData);
}

// Apply Filters for SEO Chart
function applySeoFilters() {
  const selectedDevice = document.getElementById("seoDeviceFilter").value;
  const selectedSeo = document.getElementById("seoFilter").value;

  let filteredData = latestData;

  // Filter by Device
  if (selectedDevice !== "All") {
    filteredData = filteredData.filter((d) => d.device === selectedDevice);
  }

  // Filter by SEO
  if (selectedSeo !== "All") {
    let [min, max] = selectedSeo.split("-").map(Number);

    // Swap min and max if the range is descending (e.g., 100-80)
    if (min > max) {
      [min, max] = [max, min]; // Swap values
    }

    console.log(`Filtering by SEO: ${min} - ${max}`);
    filteredData = filteredData.filter((d) => {
      console.log(`Checking SEO: ${d.seo_metrics}`);
      return d.seo_metrics >= min && d.seo_metrics <= max;
    });
  }

  console.log("Filtered Data:", filteredData);
  updateSeoChart(filteredData);
}

// Apply Filters for Accessibility Chart
function applyAccessibilityFilters() {
  const selectedDevice = document.getElementById(
    "accessibilityDeviceFilter"
  ).value;
  const selectedAccessibility = document.getElementById(
    "accessibilityFilter"
  ).value;

  let filteredData = latestData;

  // Filter by Device
  if (selectedDevice !== "All") {
    filteredData = filteredData.filter((d) => d.device === selectedDevice);
  }

  // Filter by Accessibility
  if (selectedAccessibility !== "All") {
    let [min, max] = selectedAccessibility.split("-").map(Number);

    // Swap min and max if the range is descending (e.g., 100-80)
    if (min > max) {
      [min, max] = [max, min]; // Swap values
    }

    console.log(`Filtering by Accessibility: ${min} - ${max}`);
    filteredData = filteredData.filter((d) => {
      console.log(`Checking Accessibility: ${d.accessibility_metrics}`);
      return d.accessibility_metrics >= min && d.accessibility_metrics <= max;
    });
  }

  console.log("Filtered Data:", filteredData);
  updateAccessibilityChart(filteredData);
}

// Apply Filters for Best Practices Chart
function applyBestPracticeFilters() {
  const selectedDevice = document.getElementById(
    "bestPracticeDeviceFilter"
  ).value;
  const selectedBestPractice =
    document.getElementById("bestPracticeFilter").value;

  let filteredData = latestData;

  // Filter by Device
  if (selectedDevice !== "All") {
    filteredData = filteredData.filter((d) => d.device === selectedDevice);
  }

  // Filter by Best Practice
  if (selectedBestPractice !== "All") {
    let [min, max] = selectedBestPractice.split("-").map(Number);

    // Swap min and max if the range is descending (e.g., 100-80)
    if (min > max) {
      [min, max] = [max, min]; // Swap values
    }

    console.log(`Filtering by Best Practice: ${min} - ${max}`);
    filteredData = filteredData.filter((d) => {
      console.log(`Checking Best Practice: ${d.best_practice_metrics}`);
      return d.best_practice_metrics >= min && d.best_practice_metrics <= max;
    });
  }

  console.log("Filtered Data:", filteredData);
  updateBestPracticeChart(filteredData);
}

// Update Horizontal Bar Chart for Performance
function updatePerformanceChart(data) {
  // Sort data by created_at in descending order (latest first)
  data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const latestTests = {};
  const latestTestsTooltip = {};
  data.forEach((d) => {
    if (!latestTests[d.scenario]) {
      latestTests[d.scenario] = [];
    }
    if (latestTests[d.scenario].length < 3) {
      latestTests[d.scenario].push(d); // Keep only the latest 3 runs
    }
  });
  allData.forEach((d) => {
    if (!latestTestsTooltip[d.scenario]) {
      latestTestsTooltip[d.scenario] = [];
    }
    if (latestTestsTooltip[d.scenario].length < 3) {
      latestTestsTooltip[d.scenario].push(d); // Keep only the latest 3 runs
    }
  });

  // Extract only the latest run for each test
  const testNames = Object.keys(latestTests);
  const barData = testNames.map(
    (test) => latestTests[test][0].performance_metrics // Use the latest run for the bar
  );
  const tooltipData = [
    ...testNames.map(
      (test) =>
        latestTestsTooltip[test].map((run) => run.performance_metrics).reverse() // Include last 3 runs in tooltip
    ),
  ];

  // Dynamic Bar Colors
  const barColors = barData.map((score) => {
    if (score >= 80) return "rgb(0, 190, 0)"; // Green
    if (score >= 60 && score <= 79) return "rgba(255, 159, 64, 0.8)"; // Orange
    return "rgb(190, 0, 0)"; // Red
  });

  if (horizontalBarChart) {
    horizontalBarChart.destroy(); // Destroy existing chart
  }

  horizontalBarChart = new Chart(
    document.getElementById("horizontalBarChart"),
    {
      type: "bar",
      data: {
        labels: testNames,
        datasets: [
          {
            label: "Latest Performance",
            data: barData,
            backgroundColor: barColors,
            borderColor: barColors.map((color) => color.replace("0.8", "1")),
            borderWidth: 1,
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        layout: {
          padding: {
            left: 0, // Add extra padding to prevent label cropping
            right: 30,
          },
        },
        scales: {
          x: {
            beginAtZero: true,
          },
        },
        plugins: {
          tooltip: {
            callbacks: {
              label: (context) => {
                const testName = testNames[context.dataIndex];
                const runs = tooltipData[context.dataIndex];
                return runs
                  .map((run, index) => `Run ${index + 1}: ${run}`)
                  .join(", ");
              },
            },
          },
          legend: { display: false },
          title: { display: true, text: "Performance for Latest Run" },
          datalabels: {
            anchor: "end",
            align: (context) =>
              context.dataset.data[context.dataIndex] >= 95 ? "start" : "end",
            color: (context) =>
              context.raw >= 90
                ? "#000"
                : document.body.classList.contains("light-mode")
                ? "#333"
                : "#fff",
            font: { weight: "bold", size: 14 },
            formatter: (value) => value,
          },
        },
      },
      plugins: [ChartDataLabels], // Enable datalabels plugin
    }
  );
}

// Update Horizontal Bar Chart for SEO
function updateSeoChart(data) {
  // Sort data by created_at in descending order (latest first)
  data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const latestTests = {};
  const latestTestsTooltip = {};
  data.forEach((d) => {
    if (!latestTests[d.scenario]) {
      latestTests[d.scenario] = [];
    }
    if (latestTests[d.scenario].length < 3) {
      latestTests[d.scenario].push(d); // Keep only the latest 3 runs
    }
  });
  allData.forEach((d) => {
    if (!latestTestsTooltip[d.scenario]) {
      latestTestsTooltip[d.scenario] = [];
    }
    if (latestTestsTooltip[d.scenario].length < 3) {
      latestTestsTooltip[d.scenario].push(d); // Keep only the latest 3 runs
    }
  });

  // Extract only the latest run for each test
  const testNames = Object.keys(latestTests);
  const barData = testNames.map(
    (test) => latestTests[test][0].seo_metrics // Use the latest run for the bar
  );

  const tooltipData = [
    ...testNames.map(
      (test) => latestTestsTooltip[test].map((run) => run.seo_metrics) // Include last 3 runs in tooltip
    ),
  ];

  // Dynamic Bar Colors
  const barColors = barData.map((score) => {
    if (score >= 80) return "rgb(0, 190, 0)"; // Green
    if (score >= 60 && score <= 79) return "rgba(255, 159, 64, 0.8)"; // Orange
    return "rgb(190, 0, 0)"; // Red
  });

  if (seoChart) {
    seoChart.destroy(); // Destroy existing chart
  }

  seoChart = new Chart(document.getElementById("seoChart"), {
    type: "bar",
    data: {
      labels: testNames,
      datasets: [
        {
          label: "Latest SEO",
          data: barData,
          backgroundColor: barColors,
          borderColor: barColors.map((color) => color.replace("0.8", "1")),
          borderWidth: 1,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: {
          callbacks: {
            label: (context) => {
              const testName = testNames[context.dataIndex];
              const runs = tooltipData[context.dataIndex];
              return runs
                .map((run, index) => `Run ${index + 1}: ${run}`)
                .join(", ");
            },
          },
        },
        legend: { display: false },
        title: { display: true, text: "SEO for Latest Run" },
        datalabels: {
          anchor: "end",
          align: (context) =>
            context.dataset.data[context.dataIndex] >= 95 ? "start" : "end",
          color: (context) =>
            context.raw >= 90
              ? "#000"
              : document.body.classList.contains("light-mode")
              ? "#333"
              : "#fff",
          font: { weight: "bold", size: 14 },
          formatter: (value) => value,
        },
      },
    },
    plugins: [ChartDataLabels], // Enable datalabels plugin
  });
}

// Update Horizontal Bar Chart for Accessibility
function updateAccessibilityChart(data) {
  // Sort data by created_at in descending order (latest first)
  data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const latestTests = {};
  const latestTestsTooltip = {};
  data.forEach((d) => {
    if (!latestTests[d.scenario]) latestTests[d.scenario] = [];
    if (latestTests[d.scenario].length < 3) latestTests[d.scenario].push(d); // Keep only the latest 3 runs
  });
  allData.forEach((d) => {
    if (!latestTestsTooltip[d.scenario]) {
      latestTestsTooltip[d.scenario] = [];
    }
    if (latestTestsTooltip[d.scenario].length < 3) {
      latestTestsTooltip[d.scenario].push(d); // Keep only the latest 3 runs
    }
  });

  const testNames = Object.keys(latestTests);
  const barData = testNames.map(
    (test) =>
      latestTests[test][latestTests[test].length - 1].accessibility_metrics
  );
  const tooltipData = [
    ...testNames.map((test) =>
      latestTestsTooltip[test].map((run) => run.accessibility_metrics)
    ),
  ];

  // Dynamic Bar Colors
  const barColors = barData.map((score) => {
    if (score >= 80) return "rgb(0, 190, 0)"; // Green
    if (score >= 60 && score <= 79) return "rgba(255, 159, 64, 0.8)"; // Orange
    return "rgb(190, 0, 0)"; // Red
  });

  if (accessibilityChart) {
    accessibilityChart.destroy(); // Destroy existing chart
  }

  accessibilityChart = new Chart(
    document.getElementById("accessibilityChart"),
    {
      type: "bar",
      data: {
        labels: testNames,
        datasets: [
          {
            label: "Latest Accessibility",
            data: barData,
            backgroundColor: barColors,
            borderColor: barColors.map((color) => color.replace("0.8", "1")),
            borderWidth: 1,
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          tooltip: {
            callbacks: {
              label: (context) => {
                const testName = testNames[context.dataIndex];
                const runs = tooltipData[context.dataIndex];
                return runs
                  .map((run, index) => `Run ${index + 1}: ${run}`)
                  .join(", ");
              },
            },
          },
          legend: { display: false },
          title: { display: true, text: "Accessibility for Last 3 Runs" },
          datalabels: {
            anchor: "end",
            align: (context) =>
              context.dataset.data[context.dataIndex] >= 95 ? "start" : "end",
            color: (context) =>
              context.raw >= 90
                ? "#000"
                : document.body.classList.contains("light-mode")
                ? "#333"
                : "#fff",
            font: { weight: "bold", size: 14 },
            formatter: (value) => value,
          },
        },
      },
      plugins: [ChartDataLabels], // Enable datalabels plugin
    }
  );
}

// Update Horizontal Bar Chart for Best Practices
function updateBestPracticeChart(data) {
  // Sort data by created_at in descending order (latest first)
  data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const latestTests = {};
  const latestTestsTooltip = {};
  data.forEach((d) => {
    if (!latestTests[d.scenario]) {
      latestTests[d.scenario] = [];
    }
    if (latestTests[d.scenario].length < 3) {
      latestTests[d.scenario].push(d); // Keep only the latest 3 runs
    }
  });
  allData.forEach((d) => {
    if (!latestTestsTooltip[d.scenario]) {
      latestTestsTooltip[d.scenario] = [];
    }
    if (latestTestsTooltip[d.scenario].length < 3) {
      latestTestsTooltip[d.scenario].push(d); // Keep only the latest 3 runs
    }
  });

  // Extract only the latest run for each test
  const testNames = Object.keys(latestTests);
  const barData = testNames.map(
    (test) => latestTests[test][0].best_practice_metrics // Use the latest run for the bar
  );
  const tooltipData = testNames.map(
    (test) => latestTestsTooltip[test].map((run) => run.best_practice_metrics) // Include last 3 runs in tooltip
  );

  // Dynamic Bar Colors
  const barColors = barData.map((score) => {
    if (score >= 80) return "rgb(0, 190, 0)"; // Green
    if (score >= 60 && score <= 79) return "rgba(255, 159, 64, 0.8)"; // Orange
    return "rgb(190, 0, 0)"; // Red
  });

  if (bestPracticeChart) {
    bestPracticeChart.destroy(); // Destroy existing chart
  }

  bestPracticeChart = new Chart(document.getElementById("bestPracticeChart"), {
    type: "bar",
    data: {
      labels: testNames,
      datasets: [
        {
          label: "Latest Best Practices",
          data: barData,
          backgroundColor: barColors,
          borderColor: barColors.map((color) => color.replace("0.8", "1")),
          borderWidth: 1,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: {
          callbacks: {
            label: (context) => {
              const testName = testNames[context.dataIndex];
              const runs = tooltipData[context.dataIndex];
              return runs
                .map((run, index) => `Run ${index + 1}: ${run}`)
                .join(", ");
            },
          },
        },
        legend: { display: false },
        title: { display: true, text: "Best Practices for Latest Run" },
        datalabels: {
          anchor: "end",
          align: (context) =>
            context.dataset.data[context.dataIndex] >= 95 ? "start" : "end",
          color: (context) =>
            context.raw >= 95
              ? "#000"
              : document.body.classList.contains("light-mode")
              ? "#333"
              : "#fff",
          font: { weight: "bold", size: 14 },
          formatter: (value) => value,
        },
      },
    },
    plugins: [ChartDataLabels], // Enable datalabels plugin
  });
}

// Update Dashboard
function updateDashboard(data) {
  const latestTests = {};
  data.forEach((d) => {
    if (!latestTests[d.scenario]) latestTests[d.scenario] = [];
    if (latestTests[d.scenario].length < 3) latestTests[d.scenario].push(d);
  });

  // Function to set the color based on the score
  function setScoreColor(element, score) {
    if (score > 80) {
      element.style.color = "#4CAF50"; // Green
    } else if (score >= 50 && score <= 80) {
      element.style.color = "#FFA500"; // Orange/Deep Yellow
    } else {
      element.style.color = "#FF5252"; // Red
    }
  }

  // Update the scores and set their colors
  const accessibilityScoreElement = document.getElementById(
    "accessibility-score"
  );
  const seoScoreElement = document.getElementById("seo-score");
  const bestPracticeScoreElement = document.getElementById(
    "best-practice-score"
  );

  const accessibilityScore = data[data.length - 1].accessibility_metrics;
  const seoScore = data[data.length - 1].seo_metrics;
  const bestPracticeScore = data[data.length - 1].best_practice_metrics;

  accessibilityScoreElement.innerText = accessibilityScore;
  seoScoreElement.innerText = seoScore;
  bestPracticeScoreElement.innerText = bestPracticeScore;

  // Set colors based on scores
  setScoreColor(accessibilityScoreElement, accessibilityScore);
  setScoreColor(seoScoreElement, seoScore);
  setScoreColor(bestPracticeScoreElement, bestPracticeScore);

  updatePerformanceChart(data);
  updateSeoChart(data);
  updateAccessibilityChart(data);
  updateBestPracticeChart(data);

  // Bar Chart for Device Comparison
  const devices = {};
  data.forEach((d) => {
    if (!devices[d.device])
      devices[d.device] = { count: 0, performance_metrics: 0 };
    devices[d.device].count++;
    devices[d.device].performance_metrics += d.performance_metrics;
  });
  const deviceLabels = Object.keys(devices);
  const deviceData = deviceLabels.map((d) =>
    Math.round(devices[d].performance_metrics / devices[d].count)
  );
  new Chart(document.getElementById("deviceChart"), {
    type: "bar",
    data: {
      labels: deviceLabels,
      datasets: [
        {
          label: "Avg Performance",
          data: deviceData,
          backgroundColor: "rgb(88, 62, 37)",
        },
      ],
    },
    options: {
      responsive: true,
      scales: {
        y: {
          ticks: {
            font: {
              size: window.innerWidth < 480 ? 10 : 14, // Adjust font size based on screen width
            },
            maxRotation: 0, // Prevent rotation
            minRotation: 0,
          },
        },
        x: {
          ticks: {
            font: {
              size: window.innerWidth < 480 ? 10 : 14,
            },
          },
          beginAtZero: true,
        },
      },
      elements: {
        bar: {
          barThickness: window.innerWidth < 480 ? 10 : 20, // Adjust bar thickness for small screens
        },
      },

      plugins: {
        legend: { display: false },
        title: { display: true, text: "Device Performance Comparison" },
        datalabels: {
          color: "#fff",
          font: { weight: "bold", size: 14 },
        },
      },
    },
  });

  // Table for Latest Test Results
  const tableBody = document.getElementById("data-table");
  tableBody.innerHTML = ""; // Clear existing rows
  const pagination = document.getElementById("pagination");
  pagination.innerHTML = ""; // Clear existing pagination buttons

  // Calculate average data for all tests
  const avgData = calculateAverageData(data);

  // Display average data in the table
  const avgRow = `<tr><td>Average</td><td>-</td><td>${avgData.performance_metrics.toFixed(
    2
  )}</td><td>${avgData.accessibility_metrics.toFixed(
    2
  )}</td><td>${avgData.seo_metrics.toFixed(
    2
  )}</td><td>${avgData.best_practice_metrics.toFixed(2)}</td><td>-</td></tr>`;
  tableBody.innerHTML += avgRow;

  // Pagination Logic
  const totalPages = Math.ceil(data.length / rowsPerPage);
  for (let i = 1; i <= totalPages; i++) {
    const button = document.createElement("button");
    button.innerText = i;
    button.addEventListener("click", () => {
      currentPage = i;
      updateTable(data);
    });
    pagination.appendChild(button);
  }

  // Update table with paginated data
  updateTable(data);
}

// Calculate average data for all tests
function calculateAverageData(data) {
  const totalTests = data.length;
  const avgData = {
    performance_metrics:
      data.reduce((sum, d) => sum + d.performance_metrics, 0) / totalTests,
    accessibility_metrics:
      data.reduce((sum, d) => sum + d.accessibility_metrics, 0) / totalTests,
    seo_metrics: data.reduce((sum, d) => sum + d.seo_metrics, 0) / totalTests,
    best_practice_metrics:
      data.reduce((sum, d) => sum + d.best_practice_metrics, 0) / totalTests,
  };
  return avgData;
}

let showLatestRunOnly = false; // Track checkbox state

// Toggle latest run results
function toggleLatestRun() {
  showLatestRunOnly = document.getElementById("latestRunCheckbox").checked;
  updateTable(allData); // Re-render the table with the updated filter
}

// Update table with paginated data
function updateTable(data) {
  const tableBody = document.getElementById("data-table");
  tableBody.innerHTML = ""; // Clear existing rows

  // Filter data to show only the latest run for each test if the checkbox is ticked
  let filteredData = data;
  if (showLatestRunOnly) {
    const latestTests = {};
    data.forEach((d) => {
      if (
        !latestTests[d.scenario] ||
        new Date(d.created_at) > new Date(latestTests[d.scenario].created_at)
      ) {
        latestTests[d.scenario] = d;
      }
    });
    filteredData = Object.values(latestTests);
  }

  // Apply device filter if any
  const selectedDevice = document.getElementById("tableDeviceFilter").value;
  if (selectedDevice !== "All") {
    filteredData = filteredData.filter((d) => d.device === selectedDevice);
  }

  const start = (currentPage - 1) * rowsPerPage;
  const end = start + rowsPerPage;
  const paginatedData = filteredData.slice(start, end);

  paginatedData.forEach((d) => {
    const row = `<tr>
                    <td>${d.scenario}</td>
                    <td>${d.device}</td>
                    <td>${d.performance_metrics}</td>
                    <td>${d.accessibility_metrics}</td>
                    <td>${d.seo_metrics}</td>
                    <td>${d.best_practice_metrics}</td>
                    <td>${formatDate(d.created_at)}</td>
                  </tr>`;
    tableBody.innerHTML += row;
  });

  // Update pagination
  const totalPages = Math.ceil(filteredData.length / rowsPerPage);
  updatePagination(totalPages);
}

// Format date to be more readable
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleString(); // Adjust the format as needed
}

// Populate Device Filter Options for Table
function populateTableDeviceFilter(data) {
  const deviceTypes = [...new Set(data.map((d) => d.device))];
  const filter = document.getElementById("tableDeviceFilter");
  deviceTypes.forEach((device) => {
    const option = document.createElement("option");
    option.value = device;
    option.textContent = device;
    filter.appendChild(option);
  });
}

// Apply Filters for Table
function applyTableFilters() {
  const selectedDevice = document.getElementById("tableDeviceFilter").value;
  let filteredData = allData;

  // Filter by Device
  if (selectedDevice !== "All") {
    filteredData = filteredData.filter((d) => d.device === selectedDevice);
  }

  // Update the table with the filtered data
  updateTable(filteredData);
}
// Fetch data on page load
fetchData();
fetchLatestData();
