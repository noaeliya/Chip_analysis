import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClientModule, HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';

/**
 * Interface representing a telemetry processing task
 */
interface Task {
  status: string;
  progress: number;
  result?: string;
  analyticsLoaded?: boolean; // Flag to check if chip analytics are fetched
}

/**
 * Interface representing the analytical results of a single chip
 */
interface ChipResult {
  sensor_id: string;
  avg_temperature: number;
  anomalies_count: number;
}

/**
 * Interface representing historical data item for a specific sensor
 */
interface SensorHistoryItem {
  task_id: string;
  avg_temperature: number;
  anomalies_count: number;
  run_time: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, HttpClientModule, FormsModule],
  template: `
    <div class="dashboard">
      <h1>🏗️ Dashboard ניהול משימות טלמטריה</h1>
      <p class="subtitle">ארכיטקטורת מולטי-פרוססינג, דגימת SQLite ו-IPC בזמן אמת</p>
      
      <div class="search-container">
        <h2>🔍 מערכת תחקור ותחקור היסטוריית שבבים (Indexed Search)</h2>
        <p class="section-desc">הזיני מזהה שבב ספציפי (למשל: CHIP_A_SENSOR_1 עד 100) כדי לשלוף את הריצה האחרונה שלו מתוך ה-DB.</p>
        
        <div class="search-box">
          <input 
            type="text" 
            [(ngModel)]="searchSensorId" 
            placeholder="הקלידי מזהה שבב... (למשל: CHIP_A_SENSOR_45)" 
            class="search-input"
          />
          <button class="btn-search" (click)="searchSensorHistory()">🔎 חקור שבב בזמן אמת</button>
        </div>

        <div *ngIf="searchErrorMessage" class="error-banner">{{ searchErrorMessage }}</div>

        <div *ngIf="sensorHistory && sensorHistory.length > 0" class="results-table-wrapper">
          <h3>📊 דוח היסטוריית חומרה עבור: <span class="highlight">{{ searchedSensorTitle }}</span></h3>
          <table class="analytics-table">
            <thead>
              <tr>
                <th># מזהה משימה</th>
                <th>טמפרטורה ממוצעת</th>
                <th>🚨 כמות חריגות חום (>95°C)</th>
                <th>📅 תאריך ושעה (זמן ריצה אחרון)</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let item of sensorHistory">
                <td class="bold-text">{{ item.task_id }}</td>
                <td [style.color]="item.avg_temperature > 85 ? '#e74c3c' : '#2ecc71'" class="bold-text">
                  {{ item.avg_temperature }}°C
                </td>
                <td>
                  <span class="anomaly-badge" [ngClass]="item.anomalies_count > 0 ? 'has-anomalies' : 'clean'">
                    {{ item.anomalies_count }} חריגות
                  </span>
                </td>
                <td class="time-text">{{ item.run_time }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <hr class="separator" />

      <div class="actions-row">
        <button class="btn-primary" (click)="createNewTask()">➕ הפעל משימת עיבוד חדשה ברקע</button>
      </div>

      <div class="tasks-container">
        <h2>משימות נוכחיות בזיכרון השרת:</h2>
        
        <div *ngIf="getTaskKeys().length === 0" class="no-tasks">
          אין משימות כרגע. לחצי על הכפתור למעלה כדי להפעיל תהליך עיבוד (Worker Process).
        </div>

        <div class="task-card" *ngFor="let id of getTaskKeys()">
          <div class="task-header">
            <span class="task-id">🆔 {{ id }}</span>
            <span class="task-status" [ngClass]="tasks[id].status === 'Completed' ? 'Completed' : 'Running'">
              {{ tasks[id].status }}
            </span>
          </div>
          
          <div class="progress-bar-container">
            <div class="progress-bar" [style.width.%]="tasks[id].progress">
              {{ tasks[id].progress }}%
            </div>
          </div>
          
          <div *ngIf="tasks[id].result" class="task-result">
            📊 <b>סיכום ריצה:</b> {{ tasks[id].result }}
            
            <div *ngIf="taskAnalytics[id]" class="embedded-table-wrapper">
              <h4 class="table-title">📡 התראות חומרה קריטיות בריצה זו (ממוצע > 95°C):</h4>
              
              <div *ngIf="taskAnalytics[id].length === 0" class="all-clean-msg">
                ✅ הכל תקין! אף שבב לא עבר ממוצע של 95°C בריצה זו.
              </div>

              <table *ngIf="taskAnalytics[id].length > 0" class="inner-table">
                <thead>
                  <tr>
                    <th>מזהה שבב</th>
                    <th>טמפרטורה ממוצעת</th>
                    <th>חריגות חום (>95°C)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr *ngFor="let chip of taskAnalytics[id]">
                    <td class="chip-name">{{ chip.sensor_id }}</td>
                    <td [style.color]="chip.avg_temperature > 85 ? '#e74c3c' : '#2ecc71'" class="bold">
                      {{ chip.avg_temperature }}°C
                    </td>
                    <td>
                      <span class="inner-badge" [ngClass]="chip.anomalies_count > 0 ? 'bad' : 'good'">
                        {{ chip.anomalies_count }} חריגות
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .dashboard { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 900px; margin: 40px auto; padding: 30px; direction: rtl; background: white; border-radius: 12px; box-shadow: 0 5px 25px rgba(0,0,0,0.05); }
    h1 { color: #2c3e50; margin-bottom: 5px; }
    h2 { color: #2c3e50; font-size: 20px; margin-top: 0; }
    .subtitle { color: #7f8c8d; margin-bottom: 30px; font-size: 15px; }
    .section-desc { color: #7f8c8d; font-size: 14px; margin-bottom: 20px; }
    
    .actions-row { display: flex; gap: 15px; margin-bottom: 30px; }
    .btn-primary { background-color: #3498db; color: white; border: none; padding: 14px 28px; font-size: 16px; font-weight: bold; border-radius: 8px; cursor: pointer; flex: 1; text-align: center; transition: background 0.2s; }
    .btn-primary:hover { background-color: #2980b9; }
    
    .tasks-container { margin-top: 20px; }
    .no-tasks { background: #f8f9fa; padding: 25px; border-radius: 8px; text-align: center; color: #95a5a6; border: 1px dashed #bdc3c7; }
    .task-card { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin-bottom: 15px; box-shadow: 0 2px 8px rgba(0,0,0,0.02); }
    .task-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .task-id { font-weight: bold; color: #34495e; }
    .task-status { padding: 5px 12px; border-radius: 20px; font-size: 13px; font-weight: bold; }
    .task-status.Running { background-color: #ffeaa7; color: #b7791f; }
    .task-status.Completed { background-color: #55efc4; color: #00b894; }
    
    .progress-bar-container { background: #dfe6e9; border-radius: 10px; overflow: hidden; height: 22px; width: 100%; }
    .progress-bar { background: #2ecc71; height: 100%; color: white; text-align: center; font-size: 12px; line-height: 22px; font-weight: bold; transition: width 0.4s ease; }
    .task-result { margin-top: 12px; background: #f1f2f6; padding: 12px; border-radius: 6px; font-size: 14px; color: #2c3e50; border-right: 4px solid #3498db; }
    
    .embedded-table-wrapper { margin-top: 15px; background: white; border-radius: 6px; padding: 15px; border: 1px solid #e2e8f0; }
    .table-title { margin: 0 0 10px 0; color: #2c3e50; font-size: 14px; font-weight: bold; }
    .all-clean-msg { color: #2e7d32; font-size: 13px; padding: 5px 0; font-weight: 500; }
    .inner-table { width: 100%; border-collapse: collapse; text-align: right; }
    .inner-table th { background: #f8fafc; padding: 8px; font-size: 13px; color: #64748b; border-bottom: 1px solid #e2e8f0; }
    .inner-table td { padding: 8px; font-size: 13px; border-bottom: 1px solid #f1f5f9; }
    .chip-name { font-weight: bold; color: #334155; }
    .inner-badge { padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: bold; }
    .inner-badge.good { background: #dcfce7; color: #166534; }
    .inner-badge.bad { background: #fee2e2; color: #991b1b; }

    .separator { border: 0; height: 1px; background: #e0e0e0; margin: 40px 0; }
    
    .search-container { background: #fdfdfd; border: 1px solid #eaedf1; padding: 25px; border-radius: 12px; }
    .search-box { display: flex; gap: 10px; margin-bottom: 25px; }
    .search-input { flex: 1; padding: 14px 20px; font-size: 15px; border: 2px solid #bdc3c7; border-radius: 8px; outline: none; }
    .btn-search { background-color: #2ecc71; color: white; border: none; padding: 14px 25px; font-size: 15px; font-weight: bold; border-radius: 8px; cursor: pointer; }
    
    .analytics-table { width: 100%; border-collapse: collapse; margin-top: 15px; text-align: right; }
    .analytics-table th { background-color: #f4f6f9; color: #34495e; padding: 14px; border-bottom: 2px solid #cbd5e1; }
    .analytics-table td { padding: 14px; border-bottom: 1px solid #e2e8f0; }
    .anomaly-badge { padding: 4px 10px; border-radius: 6px; font-size: 13px; font-weight: bold; }
    .anomaly-badge.has-anomalies { background-color: #ffdad6; color: #ba1a1a; }
    .anomaly-badge.clean { background-color: #e8f5e9; color: #2e7d32; }
  `]
})
export class AppComponent implements OnInit {
  // Global maps to track state across async background processes
  tasks: { [key: string]: Task } = {};
  taskAnalytics: { [key: string]: ChipResult[] } = {};
  
  // AWS Application Load Balancer target URLs
  private baseServerUrl = 'http://task-1855629512.eu-west-1.elb.amazonaws.com';
  private apiUrl = `${this.baseServerUrl}/api/tasks`;

  // Search system component states
  searchSensorId: string = '';
  searchedSensorTitle: string = '';
  sensorHistory: SensorHistoryItem[] | null = null;
  searchErrorMessage: string = '';

  constructor(private http: HttpClient) {}

  /**
   * Component Lifecycle Hook. Resets database state upon page initialization
   * to provide a clean dashboard view, then runs initial fetch.
   */
  ngOnInit() {
    this.http.post(`${this.baseServerUrl}/api/reset`, {}).subscribe({
      next: () => {
        console.log('--- [DATABASE] Reset complete upon page load ---');
        this.fetchTasksImmediate();
      },
      error: (err) => {
        console.error('Reset failed, fetching existing state instead:', err);
        this.fetchTasksImmediate();
      }
    });
  }

  /**
   * Spawns a new asynchronous background worker task via backend.
   * Establishes a localized polling interval to track status updates.
   */
  createNewTask() {
    this.http.post(this.apiUrl, {}).subscribe({
      next: () => {
        this.fetchTasksImmediate();

        // High-frequency polling to track worker multiprocessing states
        const intervalId = setInterval(() => {
          this.http.get<{ [key: string]: Task }>(this.apiUrl).subscribe({
            next: (data) => {
              this.tasks = data;
              
              // Lazy-load internal granular metrics for completed tasks
              Object.keys(this.tasks).forEach(id => {
                if (this.tasks[id].status === 'Completed' && !this.taskAnalytics[id]) {
                  this.loadChipAnalyticsForTask(id);
                }
              });

              // Terminate polling loop when all active jobs reach finality
              const allDone = Object.values(this.tasks).every(task => 
                task.status === 'Completed' || task.status.startsWith('Failed')
              );
              if (allDone) {
                clearInterval(intervalId);
              }
            },
            error: (err) => {
              console.error('Polling error:', err);
              clearInterval(intervalId);
            }
          });
        }, 1500);
      },
      error: (err) => console.error('Failed to trigger background process:', err)
    });
  }

  /**
   * Immediate synchronization to pull database changes into component state map.
   */
  fetchTasksImmediate() {
    this.http.get<{ [key: string]: Task }>(this.apiUrl).subscribe({
      next: (data) => {
        this.tasks = data;
        Object.keys(this.tasks).forEach(id => {
          if (this.tasks[id].status === 'Completed' && !this.taskAnalytics[id]) {
            this.loadChipAnalyticsForTask(id);
          }
        });
      },
      error: (err) => console.error('Immediate synchronization failed:', err)
    });
  }

  /**
   * Fetches computed telemetry anomaly data metrics for a specific completed task ID.
   */
  loadChipAnalyticsForTask(taskId: string) {
    const url = `${this.apiUrl}/${taskId}/analytics`;
    this.http.get<ChipResult[]>(url).subscribe({
      next: (results) => {
        this.taskAnalytics[taskId] = results;
      },
      error: (err) => console.error(`Error loading chip results for task ${taskId}:`, err)
    });
  }

  /**
   * Executes indexed direct lookup search for a singular chip hardware identifier.
   */
  searchSensorHistory() {
    if (!this.searchSensorId.trim()) {
      this.searchErrorMessage = 'Please enter a valid chip ID to query.';
      this.sensorHistory = null;
      return;
    }
    this.searchErrorMessage = '';
    const sensorUrl = `${this.baseServerUrl}/api/sensors/${this.searchSensorId.trim()}/history`;

    this.http.get<{ sensor_id: string; total_tests_found: number; history: SensorHistoryItem[] }>(sensorUrl).subscribe({
      next: (response) => {
        this.sensorHistory = response.history;
        this.searchedSensorTitle = response.sensor_id;
        if (this.sensorHistory.length === 0) {
          this.searchErrorMessage = `No historical records discovered for "${this.searchSensorId}" in the database.`;
        }
      },
      error: (err) => {
        console.error('Search query failure:', err);
        this.searchErrorMessage = 'Network communication failure or non-existent hardware identifier.';
        this.sensorHistory = null;
      }
    });
  }

  /**
   * Utility helper to extract string object key arrays for iteration templates.
   */
  getTaskKeys(): string[] {
    return Object.keys(this.tasks);
  }
}