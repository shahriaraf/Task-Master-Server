const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Create HTTP server and WebSocket server
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST", "PUT", "DELETE"]
    }
});

// MongoDB Connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.yaybs.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        await client.connect();
        const db = client.db("taskManagement");
        const tasksCollection = db.collection("tasks");
        const usersCollection = db.collection("user");

        console.log("Connected to MongoDB!");

        // Listen for real-time updates
        const changeStream = tasksCollection.watch();

        changeStream.on("change", (change) => {
            io.emit("taskUpdated", { type: change.operationType, data: change });
        });

        // 1️⃣ Add a new task
        // Backend Route to Add a Task
        app.post("/tasks", async (req, res) => {
            try {
                const { title, description, category } = req.body;
        
                if (!title || !category) {
                    return res.status(400).json({ message: "Title and category are required." });
                }
        
                const newTask = {
                    title,
                    description: description || "",
                    category,
                    createdAt: new Date(),
                };
        
                const result = await tasksCollection.insertOne(newTask);
        
                if (result.acknowledged) {
                    res.status(201).json({ _id: result.insertedId, ...newTask });
                } else {
                    res.status(500).json({ message: "Failed to insert task" });
                }
            } catch (error) {
                console.error("Error adding task:", error);
                res.status(500).json({ message: "Error adding task", error: error.message });
            }
        });
        

        // 2️⃣ Get all tasks
        app.get("/tasks", async (req, res) => {
            try {
                const tasks = await tasksCollection.find({}).toArray();
                res.status(200).json(tasks);
            } catch (error) {
                res.status(500).json({ message: "Error fetching tasks", error });
            }
        });

        // 3️⃣ Update a task
        app.put("/tasks/:id", async (req, res) => {
            try {
                const { id } = req.params;
                const { title, description, category } = req.body;

                if (!title || !category) {
                    return res.status(400).json({ message: "Title and category are required." });
                }

                const updatedTask = await tasksCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { title, description, category } }
                );

                if (updatedTask.modifiedCount === 0) {
                    return res.status(404).json({ message: "Task not found or no changes made." });
                }

                res.status(200).json({ message: "Task updated successfully" });
            } catch (error) {
                res.status(500).json({ message: "Error updating task", error });
            }
        });

        // 4️⃣ Delete a task
        app.delete("/tasks/:id", async (req, res) => {
            try {
                const { id } = req.params;
                const result = await tasksCollection.deleteOne({ _id: new ObjectId(id) });

                if (result.deletedCount === 0) {
                    return res.status(404).json({ message: "Task not found" });
                }

                res.status(200).json({ message: "Task deleted successfully" });
            } catch (error) {
                res.status(500).json({ message: "Error deleting task", error });
            }
        });

        app.patch("/tasks/:id", async (req, res) => {
            const { id } = req.params;
            const { category } = req.body;
          
            if (!ObjectId.isValid(id)) {
              return res.status(400).json({ error: "Invalid task ID" });
            }
          
            const result = await tasksCollection.updateOne(
              { _id: new ObjectId(id) },
              { $set: { category } }
            );
          
            if (result.matchedCount === 0) {
              return res.status(404).json({ error: "Task not found" });
            }
          
            res.json({ message: "Task updated successfully" });
          });

          app.post("/auth/google", async (req, res) => {
            const { uid, email, displayName } = req.body;
      
            try {
              // Check if user already exists
              let user = await usersCollection.findOne({ uid });
      
              if (!user) {
                // If the user doesn't exist, create a new user document
                const newUser = {
                  uid,
                  email,
                  displayName,
                  createdAt: new Date(),
                };
      
                const result = await usersCollection.insertOne(newUser);
                user = { ...newUser, _id: result.insertedId };
              }
      
              // Respond with user data
              res.status(200).json(user);
            } catch (error) {
              console.error("Error storing user data:", error);
              res.status(500).json({ message: "Error storing user data" });
            }
          });

        // WebSocket Connection
        io.on("connection", (socket) => {
            console.log("A user connected");
            socket.on("disconnect", () => {
                console.log("A user disconnected");
            });
        });

    } catch (error) {
        console.error("Error connecting to MongoDB:", error);
    }
}
run().catch(console.dir);

// Test Route
app.get("/", (req, res) => {
    res.send("Task Management API is Running...");
});

// Start Server
server.listen(port, () => {
    console.log(`Server running on port ${port}`);
});