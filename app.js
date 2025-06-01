import express from 'express';
import 'dotenv/config'; 
import cors from 'cors';
import { configDotenv } from 'dotenv';
import adminRouter from './router/admin.js';
const app = express();
const PORT = process.env.PORT || 3000;
configDotenv();
app.use(cors()); 
app.use(express.json()); 
app.use('/api/admin', adminRouter);  

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
}
);  