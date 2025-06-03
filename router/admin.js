import express, { Router } from "express";
import { createClient } from '@supabase/supabase-js';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import nodemailer from 'nodemailer';
import KYCService from '../src/services/kycService.js';
import getKYCStatus from '../src/services/get-kyc-status.js';
import updateKYCStatus from '../src/services/update-kyc-status.js';

const adminRouter = express.Router();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

const uploadFields = [
    { name: 'idDocument', maxCount: 1 },
    { name: 'addressProof', maxCount: 1 },
    { name: 'taxForm', maxCount: 1 },
    { name: 'sourceOfFundsDoc', maxCount: 1 },
    { name: 'articlesOfIncorporation', maxCount: 1 },
    { name: 'operatingAgreement', maxCount: 1 },
    { name: 'certificateOfGoodStanding', maxCount: 1 },
    { name: 'beneficialOwnerIds', maxCount: 10 },
    { name: 'authorizationDocument', maxCount: 1 },
    { name: 'financialDocuments', maxCount: 5 }
];

// Submit KYC Application
adminRouter.post("/kyc-verification", upload.fields(uploadFields), async (req, res) => {
    try {
        // Parse JSON strings from form data
        req.body.contactInfo = JSON.parse(req.body.contactInfo);
        req.body.declarations = JSON.parse(req.body.declarations);
        req.body.eddScreening = JSON.parse(req.body.eddScreening);
        req.body.investorDetails = JSON.parse(req.body.investorDetails);
        req.body.beneficialOwners = req.body.beneficialOwners ? JSON.parse(req.body.beneficialOwners) : null;
        req.body.authorizedSignatories = req.body.authorizedSignatories ? JSON.parse(req.body.authorizedSignatories) : null;

        const result = await KYCService.submitKYCApplication(req);
        
        res.status(201).json({
            success: true,
            message: 'KYC application submitted successfully',
            ...result
        });

    } catch (error) {
        console.error('KYC Verification Error:', error);
        res.status(500).json({
            success: false,
            message: 'Error processing KYC application',
            error: error.message
        });
    }
});


adminRouter.get("/kyc-verification-status/:email", async (req, res) => {
    try {
        console.log(req.params.email);
        
        const result = await getKYCStatus(req.params.email);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching KYC application status',
            error: error.message
        });
    }
});

// Update KYC status route - handles both GET (from email links) and POST (from API calls)
adminRouter.all('/kyc-verification-status', async (req, res) => {
    try {
        // Get email and status from either query params (GET) or body (POST)
        const email = req.query.email || req.body.email;
        const status = req.query.status || req.body.status;

        if (!email || !status) {
            return res.status(400).json({
                success: false,
                message: 'Email and status are required',
                status: 'invalid_input'
            });
        }

        const result = await updateKYCStatus(email, status);
        
        // If it's a GET request (from email link), render a simple HTML response
        if (req.method === 'GET') {
            const html = `
                <!DOCTYPE html>
                <html>
                <head>
                    <title>KYC Status Update</title>
                    <style>
                        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                        .message { margin: 20px 0; padding: 20px; border-radius: 5px; }
                        .success { background-color: #d4edda; color: #155724; }
                        .error { background-color: #f8d7da; color: #721c24; }
                        .button { 
                            display: inline-block;
                            padding: 10px 20px;
                            background-color: #007bff;
                            color: white;
                            text-decoration: none;
                            border-radius: 5px;
                            margin-top: 20px;
                        }
                    </style>
                </head>
                <body>
                    <div class="message ${result.success ? 'success' : 'error'}">
                        <h2>${result.success ? 'Status Updated Successfully' : 'Update Failed'}</h2>
                        <p>${result.message}</p>
                    </div>
                </body>
                </html>
            `;
            return res.send(html);
        }

        // For POST requests, return JSON response
        res.json(result);
    } catch (error) {
        console.error('KYC Status Update Error:', error);
        const errorResponse = {
            success: false,
            message: 'Error updating KYC application status',
            error: error.message
        };

        // If it's a GET request, render error page
        if (req.method === 'GET') {
            const html = `
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Error - KYC Status Update</title>
                    <style>
                        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                        .error { 
                            background-color: #f8d7da; 
                            color: #721c24;
                            margin: 20px 0;
                            padding: 20px;
                            border-radius: 5px;
                        }
                        .button { 
                            display: inline-block;
                            padding: 10px 20px;
                            background-color: #007bff;
                            color: white;
                            text-decoration: none;
                            border-radius: 5px;
                            margin-top: 20px;
                        }
                    </style>
                </head>
                <body>
                    <div class="error">
                        <h2>Error Updating Status</h2>
                        <p>${errorResponse.message}</p>
                    </div>
                    <a href="${process.env.ADMIN_DASHBOARD_URL || 'http://localhost:3000'}/kyc-applications" class="button">
                        Return to Dashboard
                    </a>
                </body>
                </html>
            `;
            return res.status(500).send(html);
        }

        // For POST requests, return JSON error
        res.status(500).json(errorResponse);
    }
});

export default adminRouter;