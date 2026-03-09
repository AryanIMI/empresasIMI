import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("research.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS research_tasks (
    id TEXT PRIMARY KEY,
    municipality TEXT NOT NULL,
    state TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS research_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT,
    municipality TEXT,
    state TEXT,
    contract_type TEXT,
    company TEXT,
    solution_area TEXT,
    contract_date TEXT,
    contract_value TEXT,
    status TEXT,
    document_link TEXT,
    description TEXT,
    opportunity_analysis TEXT,
    FOREIGN KEY(task_id) REFERENCES research_tasks(id)
  );

  CREATE TABLE IF NOT EXISTS research_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT,
    uri TEXT,
    title TEXT,
    FOREIGN KEY(task_id) REFERENCES research_tasks(id)
  );
`);

async function startServer() {
  const app = express();
  app.use(express.json());
  const PORT = 8080;

  // API Routes
  app.post("/api/research", (req, res) => {
    const { municipality, state } = req.body;
    const id = Math.random().toString(36).substring(7);
    
    db.prepare("INSERT INTO research_tasks (id, municipality, state) VALUES (?, ?, ?)")
      .run(id, municipality, state);
    
    res.json({ id, status: "pending" });
  });

  app.get("/api/research/:id", (req, res) => {
    const task = db.prepare("SELECT * FROM research_tasks WHERE id = ?").get(req.params.id);
    if (!task) return res.status(404).json({ error: "Task not found" });
    
    const results = db.prepare("SELECT * FROM research_results WHERE task_id = ?").all(req.params.id);
    const sources = db.prepare("SELECT * FROM research_sources WHERE task_id = ?").all(req.params.id);
    res.json({ ...task, results, sources });
  });

  app.get("/api/tasks", (req, res) => {
    const tasks = db.prepare("SELECT * FROM research_tasks ORDER BY created_at DESC").all();
    res.json(tasks);
  });

  app.delete("/api/tasks", (req, res) => {
    const deleteResults = db.prepare("DELETE FROM research_results");
    const deleteSources = db.prepare("DELETE FROM research_sources");
    const deleteTasks = db.prepare("DELETE FROM research_tasks");

    const transaction = db.transaction(() => {
      deleteResults.run();
      deleteSources.run();
      deleteTasks.run();
    });

    transaction();
    res.json({ success: true });
  });

  app.post("/api/results", (req, res) => {
    const { task_id, results, sources, status } = req.body;
    
    const insertResult = db.prepare(`
      INSERT INTO research_results (
        task_id, municipality, state, contract_type, company, 
        solution_area, contract_date, contract_value, status, 
        document_link, description, opportunity_analysis
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertSource = db.prepare(`
      INSERT INTO research_sources (task_id, uri, title) VALUES (?, ?, ?)
    `);

    const transaction = db.transaction((resData, srcData) => {
      for (const result of resData) {
        insertResult.run(
          task_id, result.municipality, result.state, result.contract_type, 
          result.company, result.solution_area, result.contract_date, 
          result.contract_value, result.status, result.document_link, 
          result.description, result.opportunity_analysis
        );
      }
      if (srcData) {
        for (const source of srcData) {
          insertSource.run(task_id, source.uri, source.title);
        }
      }
      db.prepare("UPDATE research_tasks SET status = ? WHERE id = ?").run(status, task_id);
    });

    transaction(results, sources);
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    app.get("*", (req, res) => {
      res.sendFile(path.resolve(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
