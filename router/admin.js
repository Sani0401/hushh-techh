import express, { Router } from "express";
import { createClient } from '@supabase/supabase-js';
import docusign from 'docusign-esign';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import nodemailer from 'nodemailer';
import KYCService from '../src/services/kycService.js';
import getKYCStatus from '../src/services/get-kyc-status.js';
import updateKYCStatus from '../src/services/update-kyc-status.js';
import sendNDA from '../src/services/send-NDA.js';
import fs from 'fs';

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


adminRouter.post('/verify-NDA-documents', async (req, res) => {
    try {
        await sendNDA(req);
        return res.status(200).json({
            success: true,
            message: 'NDA documents sent successfully'
        })
    }
    catch (error) {
        return res.status(500).json({
            success: false,
            message: 'Error sending NDA documents',
            error: error.message
        })
    }
})

// Function to generate an access token using JWT Grant Flow
async function generateAccessToken() {
    const privateKey = fs.readFileSync('./src/config/private.key'); // Corrected the relative path to the private key
    const apiClient = new docusign.ApiClient();

    apiClient.setOAuthBasePath('account-d.docusign.com'); // Demo environment
    const integratorKey = process.env.DOCUSIGN_INTEGRATOR_KEY; // Add this to your .env file
    const userId = process.env.DOCUSIGN_USER_ID; // Add this to your .env file
    const scopes = ['signature'];
    const expiresIn = 3600; // Token expiration time in seconds

    try {
        const response = await apiClient.requestJWTUserToken(integratorKey, userId, scopes, privateKey, expiresIn);
        const accessToken = response.body.access_token;
        console.log('Generated Access Token:', accessToken);
        return accessToken;
    } catch (error) {
        console.error('Error generating access token:', error);
        throw error;
    }
}

// Example usage in the /send-docusign endpoint
adminRouter.get('/send-docusign', async (req, res) => {
    try {
        const { investorType, userData, companyData } = req.query;

        if (!investorType && (!userData || !companyData)) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }

        const parsedUserData = userData ? JSON.parse(userData) : null;
        const parsedCompanyData = companyData ? JSON.parse(companyData) : null;

        console.log('Received investorType:', investorType);
        console.log('Received userData:', userData);
        console.log('Received companyData:', companyData);
        console.log('Raw query parameters:', req.query);
        console.log('Parsed userData:', parsedUserData);
        console.log('Parsed companyData:', parsedCompanyData);

        // Generate a new access token
        const accessToken = await generateAccessToken();

        // DocuSign API integration
        const apiClient = new docusign.ApiClient();
        apiClient.setBasePath('https://demo.docusign.net/restapi');
        apiClient.addDefaultHeader('Authorization', `Bearer ${accessToken}`);

        const envelopesApi = new docusign.EnvelopesApi(apiClient);

        if (investorType === 'individual' && parsedUserData) {
            const envelopeDefinition = {
                templateId: process.env.DOCUSIGN_INDIVIDUAL_TEMPLATE_ID,
                templateRoles: [
                    {
                        email: parsedUserData.email,
                        name: parsedUserData.full_name,
                        roleName: 'User',
                        tabs: {
                            textTabs: [
                                { tabLabel: 'Address', value: `${parsedUserData.address.street} , ${parsedUserData.address.city}, ${parsedUserData.address.state}, ${parsedUserData.address.country}` },
                                { tabLabel: 'City', value: parsedUserData.address.city },
                                { tabLabel: 'Country', value: parsedUserData.address.country },
                                { tabLabel: 'CurrentDate', value: new Date().toISOString().split('T')[0] },
                                { tabLabel: 'Email', value: parsedUserData.email },
                                { tabLabel: 'MobileNumber', value: parsedUserData.phone },
                                { tabLabel: 'Name', value: parsedUserData.full_name },
                                { tabLabel: 'state', value: parsedUserData.address.state },
                                { tabLabel: 'Title', value: parsedUserData.designation || '' },
                            ],
                        },
                    },
                ],
                status: 'sent',
            };

            // Create the envelope
            const results = await envelopesApi.createEnvelope(process.env.DOCUSIGN_ACCOUNT_ID, {
                envelopeDefinition,
            });

            // Respond with a simple UI
            const html = `
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Envelope Sent</title>
                    <style>
                        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                        .message { margin: 20px 0; padding: 20px; border-radius: 5px; background-color: #d4edda; color: #155724; }
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
                    <div class="message">
                        <h2>Envelope Sent Successfully</h2>
                        <p>Envelope ID: ${results.envelopeId}</p>
                    </div>
                    <a href="/" class="button">Return to Dashboard</a>
                </body>
                </html>
            `;
            return res.send(html);
        } else if (investorType === 'institutional' && parsedCompanyData) {
            const envelopeDefinition = {
                templateId: process.env.DOCUSIGN_INSTITUTIONAL_TEMPLATE_ID,
                templateRoles: [
                    {
                        email: parsedCompanyData.Email,
                        name: parsedCompanyData.Name,
                        roleName: 'User',
                        tabs: {
                            textTabs: [
                                { tabLabel: 'CompanyName', value: parsedCompanyData.CompanyName },
                                { tabLabel: 'CompanyState', value: parsedCompanyData.CompanyState },
                                { tabLabel: 'CompanyAddress', value: `${parsedCompanyData.CompanyAddress.street}, ${parsedCompanyData.CompanyAddress.city}, ${parsedCompanyData.CompanyAddress.state}` },
                                { tabLabel: 'Name', value: parsedCompanyData.Name },
                                { tabLabel: 'Title', value: parsedCompanyData.Title },
                                { tabLabel: 'Email', value: parsedCompanyData.Email },
                            ],
                        },
                    },
                ],
                status: 'sent',
            };

            // Create the envelope
            const results = await envelopesApi.createEnvelope(process.env.DOCUSIGN_ACCOUNT_ID, {
                envelopeDefinition,
            });

            // Respond with a simple UI
            const html = `
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Envelope Sent</title>
                    <style>
                        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                        .message { margin: 20px 0; padding: 20px; border-radius: 5px; background-color: #d4edda; color: #155724; }
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
                    <div class="message">
                        <h2>Envelope Sent Successfully</h2>
                        <p>Envelope ID: ${results.envelopeId}</p>
                    </div>
                    <a href="/" class="button">Return to Dashboard</a>
                </body>
                </html>
            `;
            return res.send(html);
        } else {
            // Handle unsupported investor types or missing data
            return res.status(400).json({ error: 'Unsupported investor type or missing data' });
        }
    } catch (error) {
        console.error('Error sending DocuSign envelope:', error.response?.data || error.message);
        res.status(500).json({ error: 'Failed to send DocuSign envelope', details: error.message });
    }
});

// Callback route to handle DocuSign OAuth redirect
adminRouter.get('/docusign/callback', async (req, res) => {
    try {
        const { code } = req.query; // Extract the authorization code from the query parameters

        if (!code) {
            return res.status(400).json({ error: 'Authorization code is missing' });
        }

        const privateKey = fs.readFileSync('./src/config/private.key'); // Path to your private key
        const apiClient = new docusign.ApiClient();
        apiClient.setOAuthBasePath('account-d.docusign.com'); // Demo environment

        const integratorKey = process.env.DOCUSIGN_INTEGRATOR_KEY; // Add this to your .env file
        const userId = process.env.DOCUSIGN_USER_ID; // Add this to your .env file
        const scopes = ['signature'];
        const expiresIn = 3600; // Token expiration time in seconds

        // Log the parameters being sent
        console.log('Requesting JWT User Token with:', {
            integratorKey,
            userId,
            scopes,
        });

        // Use JWT Grant Flow to generate an access token
        const response = await apiClient.requestJWTUserToken(integratorKey, userId, scopes, privateKey, expiresIn);

        // Log the access token for debugging
        const accessToken = response.body.access_token;
        console.log('Access Token:', accessToken);

        // Store the access token securely (e.g., in a database or in-memory storage)
        // For demonstration purposes, we'll just send it back in the response
        res.status(200).json({
            success: true,
            message: 'Authorization successful',
            accessToken: accessToken,
        });
    } catch (error) {
        // Log the full error response for debugging
        console.error('Error handling DocuSign callback:', error.response?.data || error.message);
        res.status(500).json({ error: 'Failed to handle callback', details: error.message });
    }
});

export default adminRouter;