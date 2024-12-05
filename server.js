const tf = require("@tensorflow/tfjs-node");
const multer = require("multer");
const sharp = require("sharp");
const express = require("express");
const http = require("http");
const path = require("path");

const bodyParser = require("body-parser");
const firebaseAdmin = require("firebase-admin");

let _model;

const app = express();
const server = http.createServer(app);

app.use(bodyParser.json());

const serviceAccount = require("./ccbangkit-d0022-firebase-adminsdk-shds5-a448541157.json");

firebaseAdmin.initializeApp({
  credential: firebaseAdmin.credential.cert(serviceAccount),
});

const auth = firebaseAdmin.auth();

app.use("/model", express.static(path.join(__dirname, "model")));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

async function loadModel() {
  try {
    const model = await tf.loadGraphModel(
      "http://localhost:3000/model/model.json"
    );
    console.log("Model loaded successfully.");
    return model;
  } catch (error) {
    console.error("Error loading model:", error);
  }
}

async function preprocessImage(buffer) {
  const image = await sharp(buffer)
    .resize({ width: 224, height: 224 })
    .toBuffer();

  const tensor = tf.node.decodeImage(image, 3).expandDims().div(255.0);

  return tensor;
}

// Route for the API root
app.get("/", (req, res) => {
  res.json({
    status: true,
    message: "Welcome to the image prediction API",
  });
});

app.post("/predict", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        status: false,
        message: "No image file uploaded.",
      });
    }

    if (!_model) {
      return res.status(500).json({
        status: false,
        message: "Model not loaded.",
      });
    }

    const tensor = await preprocessImage(req.file.buffer);

    const predictions = _model.predict(tensor);
    const labels = {
      0: "better",
      1: "leminerale",
      2: "oreo",
      3: "pocari",
      4: "youc1000",
    };

    const predictionArray = await predictions.array();

    // Find the prediction with the highest confidence
    const labeledPredictions = predictionArray[0].map((value, index) => ({
      label: labels[index],
      confidence: value,
    }));

    const highestPrediction = labeledPredictions.reduce((max, current) =>
      current.confidence > max.confidence ? current : max
    );

    res.json({
      status: true,
      prediction: highestPrediction,
    });
  } catch (error) {
    console.error("Error making prediction:", error);
    res.status(500).json({
      status: false,
      message: "Error making prediction.",
    });
  }
});

app.post("/register", async (req, res) => {
  try {
    const { email, nama, katasandi } = req.body; // Extract 'email', 'nama', and 'katasandi'

    if (!email || !nama || !katasandi) {
      return res.status(400).json({
        status: false,
        message: "Email, nama, and katasandi are required.",
      });
    }

    const userRecord = await auth.createUser({
      email,
      password: katasandi,
    });

    // You can add 'nama' as custom user data if needed
    await auth.updateUser(userRecord.uid, {
      displayName: nama,
    });

    res.json({
      status: true,
      message: "User registered successfully.",
      user: {
        uid: userRecord.uid,
        email: userRecord.email,
        nama: nama, // Include 'nama' in the response
      },
    });
  } catch (error) {
    console.error("Error during registration:", error);
    res.status(500).json({
      status: false,
      message: "Registration failed.",
      error: error.message,
    });
  }
});

const db = firebaseAdmin.firestore();

app.post("/add-product", async (req, res) => {
  try {
    const products = req.body; // Expecting an array of product data

    // Loop through the products and save each one to Firestore
    const productPromises = products.map(async (product) => {
      const docRef = db.collection("products").doc(); // Creates a new document with auto-generated ID
      await docRef.set(product);
    });

    // Wait for all promises to complete
    await Promise.all(productPromises);

    res.status(200).json({
      status: true,
      message: "Products added successfully.",
    });
  } catch (error) {
    console.error("Error adding product data:", error);
    res.status(500).json({
      status: false,
      message: "Failed to add product data.",
      error: error.message,
    });
  }
});

app.get("/products", async (req, res) => {
  try {
    // Reference to the 'products' collection
    const snapshot = await db.collection("products").get();

    // Check if there are any products
    if (snapshot.empty) {
      return res.status(404).json({
        status: false,
        message: "No products found.",
      });
    }

    // Map over the documents and return them in an array
    const products = snapshot.docs.map((doc) => ({
      id: doc.id, // Include the Firestore document ID
      ...doc.data(), // Include the document data
    }));

    res.status(200).json({
      status: true,
      message: "Products retrieved successfully.",
      products: products,
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({
      status: false,
      message: "Failed to fetch products.",
      error: error.message,
    });
  }
});

// GET API to fetch articles, optionally filter by title
app.get("/articles", async (req, res) => {
  try {
    // Get the search title from query parameters (if provided)
    const { title } = req.query;

    // Build Firestore query
    let query = db.collection("articles");

    // If a title is provided, filter by title
    if (title) {
      query = query.where("title", "==", title); // Assuming 'title' is the field name in Firestore
    }

    // Execute the query
    const snapshot = await query.get();

    // Check if no articles were found
    if (snapshot.empty) {
      return res.status(404).json({
        status: false,
        message: "No articles found.",
      });
    }

    // Map over the documents and return them
    const articles = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.status(200).json({
      status: true,
      message: "Articles retrieved successfully.",
      articles: articles,
    });
  } catch (error) {
    console.error("Error fetching articles:", error);
    res.status(500).json({
      status: false,
      message: "Failed to fetch articles.",
      error: error.message,
    });
  }
});

// Route for Login
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        status: false,
        message: "Email and password are required.",
      });
    }

    // Simulate login by issuing a custom token (Firebase does not provide a direct login endpoint)
    const userRecord = await auth.getUserByEmail(email);

    if (!userRecord) {
      return res.status(400).json({
        status: false,
        message: "User not found.",
      });
    }

    const customToken = await auth.createCustomToken(userRecord.uid);

    res.json({
      status: true,
      message: "Login successful.",
      token: customToken,
    });
  } catch (error) {
    console.error("Error during login:", error);
    res.status(500).json({
      status: false,
      message: "Login failed.",
      error: error.message,
    });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
  console.log(`Server is running on port ${PORT}`);
  _model = await loadModel();
  if (!_model) {
    console.error("Model could not be loaded. Exiting...");
    process.exit(1);
  }
});
