import sqlite3
import time
import random
import os
from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
from multiprocessing import Process

DB_NAME = "chips_telemetry.db"

# Create Flask application instance and configure static folder to serve Angular builds
app = Flask(__name__, 
            static_url_path='',
            static_folder='static', 
            template_folder='static')

CORS(app)

# Establishes a database connection with specific settings for multi-process concurrency
def get_db_connection():
    return sqlite3.connect(DB_NAME, check_same_thread=False, timeout=30)

# Initializes database tables and structures, then wipes existing data for a clean startup
def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Creates the tasks tracking table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS tasks (
            task_id TEXT PRIMARY KEY,
            status TEXT,
            progress INTEGER,
            result TEXT,
            created_at REAL
        )
    ''')
    
    # Creates the raw telemetry sensors log table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS chip_sensors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sensor_id TEXT,
            temperature REAL,
            voltage REAL
        )
    ''')
    
    # Creates the final compiled analytics results table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS chip_analytics_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id TEXT,
            sensor_id TEXT,
            avg_temperature REAL,
            anomalies_count INTEGER,
            FOREIGN KEY (task_id) REFERENCES tasks(task_id)
        )
    ''')
    
    # Creates an index on sensor_id to speed up search history queries
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_sensor_id ON chip_analytics_results(sensor_id)")
    
    # Clears all previous records from the tables
    cursor.execute("DELETE FROM tasks")
    cursor.execute("DELETE FROM chip_sensors")
    cursor.execute("DELETE FROM chip_analytics_results")
    
    conn.commit()
    conn.close()
    print("--- [DATABASE] Initialized clean ---")

# Asynchronous worker function running inside an isolated process to handle heavy calculations
def heavy_task_worker(task_id):
    random.seed() 
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Step 1: Update task state and begin generating random hardware sensor readings
        cursor.execute("UPDATE tasks SET status = 'Generating raw data...', progress = 10 WHERE task_id = ?", (task_id,))
        conn.commit()
        
        cursor.execute("DELETE FROM chip_sensors")
        conn.commit()
        
        hot_chips = [f"CHIP_A_SENSOR_{i}" for i in range(1, 11)]
        sensors_data = []
        
        # Loop to generate 1000 simulated telemetry points across 100 sensors
        for i in range(1000):
            chosen_id = random.randint(1, 100)
            sensor_id = f"CHIP_A_SENSOR_{chosen_id}"
            
            if sensor_id in hot_chips:
                temperature = random.uniform(96.0, 115.0) 
                voltage = random.uniform(1.1, 1.3)        
            else:
                temperature = random.uniform(50.0, 115.0)
                voltage = random.uniform(0.8, 1.2)
                
            sensors_data.append((sensor_id, temperature, voltage))
        
        cursor.executemany("INSERT INTO chip_sensors (sensor_id, temperature, voltage) VALUES (?, ?, ?)", sensors_data)
        conn.commit()
        
        # Step 2: Fetch the newly generated raw data back for analytical grouping
        cursor.execute("UPDATE tasks SET status = 'Fetching data...', progress = 30 WHERE task_id = ?", (task_id,))
        conn.commit()
        
        cursor.execute("SELECT sensor_id, temperature FROM chip_sensors")
        rows = cursor.fetchall() 
        
        # Step 3: Run the aggregation algorithm to find averages and thermal overshoots
        cursor.execute("UPDATE tasks SET status = 'Analyzing anomalies...', progress = 60 WHERE task_id = ?", (task_id,))
        conn.commit()
        
        chip_groups = {}
        for row in rows:
            s_id, temp = row[0], row[1]
            if s_id not in chip_groups:
                chip_groups[s_id] = {'temps_sum': 0, 'count': 0, 'anomalies': 0}
            
            chip_groups[s_id]['temps_sum'] += temp
            chip_groups[s_id]['count'] += 1
            if temp > 95.0:
                chip_groups[s_id]['anomalies'] += 1
        
        analytics_rows = []
        for s_id, metrics in chip_groups.items():
            avg_temp = round(metrics['temps_sum'] / metrics['count'], 2)
            anomalies = metrics['anomalies']
            analytics_rows.append((task_id, s_id, avg_temp, anomalies))
            
        cursor.executemany("INSERT INTO chip_analytics_results (task_id, sensor_id, avg_temperature, anomalies_count) VALUES (?, ?, ?, ?)", analytics_rows)
        conn.commit()
        
        # Step 4: Finalize the task structure and update completion status to 100%
        final_summary = f"Analysis complete for {len(chip_groups)} chips."
        cursor.execute("UPDATE tasks SET status = 'Completed', progress = 100, result = ? WHERE task_id = ?", (final_summary, task_id))
        conn.commit()
        
    except Exception as e:
        try:
            cursor.execute("UPDATE tasks SET status = ?, progress = 0 WHERE task_id = ?", (f"Error: {str(e)}", task_id))
            conn.commit()
        except:
            pass
    finally:
        conn.close()

# === Endpoints ===

# POST API Endpoint: Clears all system tables and states manually upon request
@app.route('/api/reset', methods=['POST'])
def reset_database():
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM tasks")
        cursor.execute("DELETE FROM chip_sensors")
        cursor.execute("DELETE FROM chip_analytics_results")
        conn.commit()
        return jsonify({"status": "Database cleared successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()

# POST API Endpoint: Registers a new task tracking id and immediate forks a background worker process
@app.route('/api/tasks', methods=['POST'])
def create_task():
    task_id = f"task_{int(time.time())}"
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO tasks (task_id, status, progress, result, created_at) VALUES (?, 'Started', 0, NULL, ?)", (task_id, time.time()))
    conn.commit()
    conn.close()
    
    p = Process(target=heavy_task_worker, args=(task_id,))
    p.start()
    return jsonify({"task_id": task_id, "status": "Started"}), 201

# GET API Endpoint: Retrieves all existing tasks and progress metrics for the front-end dashboard monitor
@app.route('/api/tasks', methods=['GET'])
def get_tasks():
    conn = get_db_connection()
    conn.row_factory = sqlite3.Row  
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM tasks ORDER BY created_at DESC")
    rows = cursor.fetchall()
    conn.close()
    
    tasks_dict = {}
    for row in rows:
        tasks_dict[row['task_id']] = {
            "status": row['status'],
            "progress": row['progress'],
            "result": row['result']
        }
    return jsonify(tasks_dict), 200

# GET API Endpoint: Fetches computed thermal anomalies and results for a specific task index
@app.route('/api/tasks/<task_id>/analytics', methods=['GET'])
def get_task_analytics(task_id):
    conn = get_db_connection()
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT sensor_id, avg_temperature, anomalies_count 
        FROM chip_analytics_results 
        WHERE task_id = ? AND avg_temperature > 95.0
        ORDER BY avg_temperature DESC
    ''', (task_id,))
    
    rows = cursor.fetchall()
    conn.close()
    
    results = [{"sensor_id": row['sensor_id'], "avg_temperature": row['avg_temperature'], "anomalies_count": row['anomalies_count']} for row in rows]
    return jsonify(results), 200

# GET API Endpoint: Extracts the latest historical run profiles for a single queried chip id
@app.route('/api/sensors/<sensor_name>/history', methods=['GET'])
def get_sensor_history(sensor_name):
    conn = get_db_connection()
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT r.task_id, r.avg_temperature, r.anomalies_count, t.created_at
        FROM chip_analytics_results r
        JOIN tasks t ON r.task_id = t.task_id
        WHERE r.sensor_id = ?
        ORDER BY t.created_at DESC
        LIMIT 1
    ''', (sensor_name,))
    
    rows = cursor.fetchall()
    conn.close()
    
    history = []
    for row in rows:
        history.append({
            "task_id": row['task_id'],
            "avg_temperature": row['avg_temperature'],
            "anomalies_count": row['anomalies_count'],
            "run_time": time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(row['created_at']))
        })
        
    return jsonify({
        "sensor_id": sensor_name,
        "total_tests_found": len(history),
        "history": history
    }), 200

# Catch-All UI Routing Endpoint: Redirects all non-API web traffic to Angular index.html to protect deep links
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def catch_all(path):
    if path != "" and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    else:
        return send_from_directory(app.static_folder, 'index.html')

# Core application entry point: Triggers initialization and fires up the WSGI server
if __name__ == '__main__':
    init_db() 
    app.run(host='0.0.0.0', port=5000, debug=True, use_reloader=False)