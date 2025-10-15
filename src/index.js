const express = require('express');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());

app.get('/', (req, res) => {
    res.send('Welcome to AI Study Buddy!');
});

// Function to handle user interaction
app.post('/study', (req, res) => {
    const { topic, resources } = req.body;
    // Logic to manage study resources based on user input
    res.json({ message: `Resources for ${topic} have been prepared.`, resources });
});

// Start the server
app.listen(PORT, () => {
    console.log(`AI Study Buddy is running on http://localhost:${PORT}`);
});