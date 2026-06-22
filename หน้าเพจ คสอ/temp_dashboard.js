// dashboard.js – premium dynamic KPI counter and responsive chart visualizations

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const res = await fetch('/api/dashboard');
    const data = await res.json();

    // 1. Calculate Summary Metrics (KPI Counters)
    const totalShops = data.districtData.reduce((a, b) => a + b, 0);
    const totalInspections = data.inspectionData.reduce((a, b) => a + b, 0);
    const totalLabelsSum = data.labelCompleteData.reduce((a, b) => a + b, 0);
    const avgLabelRate = totalInspections > 0 ? (totalLabelsSum / totalInspections) : 0;
    const totalDrugs = data.medicineData.reduce((a, b) => a + b, 0);
    const totalBannedCosme = data.cosmeticsData.reduce((a, b) => a + b, 0);

    // 2. Smooth Counter Animation Function (WOW factor)
    const animateCount = (elementId, targetValue, isFloat = false) => {
      const element = document.getElementById(elementId);
      if (!element) return;
      
      const duration = 1200; // ms
      const startTime = performance.now();
      
      const update = (now) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // Easing function (easeOutQuad)
        const easeProgress = progress * (2 - progress);
        const current = targetValue * easeProgress;
        
        if (isFloat) {
          element.textContent = `${current.toFixed(1)} / 10`;
        } else {
          element.textContent = Math.floor(current).toLocaleString();
        }
        
        if (progress < 1) {
          requestAnimationFrame(update);
        } else {
          if (isFloat) {
            element.textContent = `${targetValue.toFixed(1)} / 10`;
          } else {
            element.textContent = targetValue.toLocaleString();
          }
        }
      };
      
      requestAnimationFrame(update);
    };

    // Trigger animations
    animateCount('val-total-shops', totalShops);
    animateCount('val-label-rate', avgLabelRate, true);
    animateCount('val-danger-drugs', totalDrugs);
    animateCount('val-banned-cosme', totalBannedCosme);

    // 3. Helper to create smooth canvas gradient fills
    const createGradient = (canvasId, colorStart, colorEnd) => {
      const canvas = document.getElementById(canvasId);
      if (!canvas) return null;
      const ctx = canvas.getContext('2d');
      const gradient = ctx.createLinearGradient(0, 0, 0, 260);
      gradient.addColorStop(0, colorStart);
      gradient.addColorStop(1, colorEnd);
      return gradient;
    };

    // Shared styling variables for Light-theme charts
    const fontConfig = { family: 'Prompt', size: 11 };
    const gridColor = 'rgba(0, 0, 0, 0.06)';
    const tickColor = '#475569';

    // Chart.js global style override
    Chart.defaults.color = '#334155';
    Chart.defaults.font.family = 'Prompt';

    // ----------------------------------------------------
    // Chart 1: Shops Inspected per District (Cyan Gradient Bar)
    // ----------------------------------------------------
    const districtCanvas = document.getElementById('districtBarChart');
    if (districtCanvas) {
      const gradientCyan = createGradient('districtBarChart', 'rgba(6, 182, 212, 0.8)', 'rgba(6, 182, 212, 0.05)');
      new Chart(districtCanvas, {
        type: 'bar',
        data: {
          labels: data.districtLabels,
          datasets: [{
            label: 'ร้านค้าที่ตรวจประเมิน (ร้าน)',
            data: data.districtData,
            backgroundColor: gradientCyan || 'rgba(6, 182, 212, 0.6)',
            borderColor: 'rgba(6, 182, 212, 1)',
            borderWidth: 1.5,
            borderRadius: 6,
            borderSkipped: false
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              padding: 12,
              cornerRadius: 10,
              backgroundColor: 'rgba(15, 23, 42, 0.95)',
              borderColor: 'rgba(255, 255, 255, 0.1)',
              borderWidth: 1,
              titleFont: { family: 'Prompt', size: 14, weight: '600' },
              bodyFont: { family: 'Prompt', size: 13 }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { stepSize: 1, color: tickColor, font: fontConfig },
              grid: { color: gridColor }
            },
            x: {
              ticks: { color: tickColor, font: fontConfig },
              grid: { display: false }
            }
          },
          animation: {
            duration: 1500,
            easing: 'easeOutElastic'
          }
        }
      });
    }

    // ----------------------------------------------------
    // Chart 2: Inspection Type (Donut with Soft Glowing Segments)
    // ----------------------------------------------------
    const donutCanvas = document.getElementById('inspectionDonutChart');
    if (donutCanvas) {
      new Chart(donutCanvas, {
        type: 'doughnut',
        data: {
          labels: data.inspectionLabels,
          datasets: [{
            data: data.inspectionData,
            backgroundColor: [
              'rgba(123, 104, 238, 0.85)', // Purple
              'rgba(6, 182, 212, 0.85)',   // Cyan
              'rgba(249, 115, 22, 0.85)',  // Orange
              'rgba(239, 68, 68, 0.85)'    // Red
            ],
            borderColor: '#ffffff',
            borderWidth: 3,
            hoverOffset: 12
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                color: '#475569',
                font: { family: 'Prompt', size: 12 },
                padding: 15
              }
            },
            tooltip: {
              padding: 12,
              cornerRadius: 10,
              backgroundColor: 'rgba(15, 23, 42, 0.95)',
              borderColor: 'rgba(255, 255, 255, 0.1)',
              borderWidth: 1,
              titleFont: { family: 'Prompt', size: 14, weight: '600' },
              bodyFont: { family: 'Prompt', size: 13 }
            }
          },
          cutout: '65%',
          animation: {
            animateRotate: true,
            animateScale: true,
            duration: 1600,
            easing: 'easeOutBack'
          }
        }
      });
    }

    // ----------------------------------------------------
    // Chart 3: Complete Labels per District (Purple Gradient Bar)
    // ----------------------------------------------------
    const labelCanvas = document.getElementById('labelBarChart');
    if (labelCanvas) {
      const gradientPurple = createGradient('labelBarChart', 'rgba(123, 104, 238, 0.8)', 'rgba(123, 104, 238, 0.05)');
      new Chart(labelCanvas, {
        type: 'bar',
        data: {
          labels: data.labelCompleteLabels,
          datasets: [{
            label: 'คะแนนความสมบูรณ์รวม',
            data: data.labelCompleteData,
            backgroundColor: gradientPurple || 'rgba(123, 104, 238, 0.6)',
            borderColor: 'rgba(123, 104, 238, 1)',
            borderWidth: 1.5,
            borderRadius: 6,
            borderSkipped: false
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              padding: 12,
              cornerRadius: 10,
              backgroundColor: 'rgba(15, 23, 42, 0.95)',
              borderColor: 'rgba(255, 255, 255, 0.1)',
              borderWidth: 1,
              titleFont: { family: 'Prompt', size: 14, weight: '600' },
              bodyFont: { family: 'Prompt', size: 13 }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { stepSize: 5, color: tickColor, font: fontConfig },
              grid: { color: gridColor }
            },
            x: {
              ticks: { color: tickColor, font: fontConfig },
              grid: { display: false }
            }
          },
          animation: {
            duration: 1500,
            easing: 'easeOutElastic'
          }
        }
      });
    }

    // ----------------------------------------------------
    // Chart 4: Grouped Bar: Medicine vs Prohibited Cosmetics
    // ----------------------------------------------------
    const prohibitedCanvas = document.getElementById('prohibitedBarChart');
    if (prohibitedCanvas) {
      const gradientRed = createGradient('prohibitedBarChart', 'rgba(239, 68, 68, 0.8)', 'rgba(239, 68, 68, 0.05)');
      const gradientOrange = createGradient('prohibitedBarChart', 'rgba(249, 115, 22, 0.8)', 'rgba(249, 115, 22, 0.05)');
      new Chart(prohibitedCanvas, {
        type: 'bar',
        data: {
          labels: data.districtLabels,
          datasets: [
            {
              label: 'ตรวจพบยาอันตราย (ร้าน)',
              data: data.medicineData,
              backgroundColor: gradientRed || 'rgba(239, 68, 68, 0.6)',
              borderColor: 'rgba(239, 68, 68, 1)',
              borderWidth: 1.5,
              borderRadius: 6,
              borderSkipped: false
            },
            {
              label: 'ตรวจพบเครื่องสำอางต้องห้าม (ร้าน)',
              data: data.cosmeticsData,
              backgroundColor: gradientOrange || 'rgba(249, 115, 22, 0.6)',
              borderColor: 'rgba(249, 115, 22, 1)',
              borderWidth: 1.5,
              borderRadius: 6,
              borderSkipped: false
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                color: '#475569',
                font: { family: 'Prompt', size: 12 },
                padding: 15
              }
            },
            tooltip: {
              padding: 12,
              cornerRadius: 10,
              backgroundColor: 'rgba(15, 23, 42, 0.95)',
              borderColor: 'rgba(255, 255, 255, 0.1)',
              borderWidth: 1,
              titleFont: { family: 'Prompt', size: 14, weight: '600' },
              bodyFont: { family: 'Prompt', size: 13 }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { stepSize: 1, color: tickColor, font: fontConfig },
              grid: { color: gridColor }
            },
            x: {
              ticks: { color: tickColor, font: fontConfig },
              grid: { display: false }
            }
          },
          animation: {
            duration: 1500,
            easing: 'easeOutElastic'
          }
        }
      });
    }
  } catch (err) {
    console.error('Failed to load dashboard data', err);
  }
});
