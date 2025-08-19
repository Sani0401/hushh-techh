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

// Add this function before generateAccessToken
async function checkDocuSignAccountStatus() {
    try {
        console.log('Checking DocuSign account status...');
        const apiClient = new docusign.ApiClient();
        apiClient.setOAuthBasePath('account-d.docusign.com');
        
        // First try to get account information without authentication
        const accountsApi = new docusign.AccountsApi(apiClient);
        
        try {
            const accountInfo = await accountsApi.getAccountInformation(process.env.DOCUSIGN_ACCOUNT_ID);
            console.log('Account status check:', {
                accountId: accountInfo.accountId,
                accountName: accountInfo.accountName,
                accountType: accountInfo.accountType,
                isActive: accountInfo.status === 'active',
                status: accountInfo.status,
                createdDate: accountInfo.createdDate,
                lastModifiedDate: accountInfo.lastModifiedDate
            });

            if (accountInfo.status !== 'active') {
                throw new Error(`DocuSign account is not active. Current status: ${accountInfo.status}`);
            }

            return true;
        } catch (error) {
            console.error('Account status check failed:', {
                error: error.message,
                response: error.response?.data,
                status: error.response?.status
            });

            // Check for specific error conditions
            if (error.response?.status === 401) {
                throw new Error('DocuSign account credentials are invalid or expired. Please check your developer account status.');
            } else if (error.response?.status === 404) {
                throw new Error('DocuSign account not found. The account may have been deactivated or deleted.');
            } else if (error.response?.status === 403) {
                throw new Error('Access to DocuSign account is forbidden. The account may be suspended or restricted.');
            }

            throw error;
        }
    } catch (error) {
        console.error('Error checking DocuSign account status:', error);
        throw new Error(`Failed to verify DocuSign account status: ${error.message}`);
    }
}

// Modify the generateAccessToken function to check account status first
async function generateAccessToken() {
    try {
        // Check account status before proceeding
        await checkDocuSignAccountStatus();
        
        console.log('Initializing DocuSign API client...');
        const apiClient = new docusign.ApiClient();
        
        // Set the OAuth base path for the demo environment
        apiClient.setOAuthBasePath('account-d.docusign.com');
        
        // Validate required environment variables
        const requiredEnvVars = {
            'DOCUSIGN_INTEGRATOR_KEY': process.env.DOCUSIGN_INTEGRATOR_KEY,
            'DOCUSIGN_USER_ID': process.env.DOCUSIGN_USER_ID,
            'DOCUSIGN_ACCOUNT_ID': process.env.DOCUSIGN_ACCOUNT_ID
        };

        // Check for missing environment variables
        const missingVars = Object.entries(requiredEnvVars)
            .filter(([_, value]) => !value)
            .map(([key]) => key);

        if (missingVars.length > 0) {
            throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
        }

        // Log the configuration
        console.log('DocuSign Configuration:', {
            integratorKey: process.env.DOCUSIGN_INTEGRATOR_KEY,
            userId: process.env.DOCUSIGN_USER_ID,
            accountId: process.env.DOCUSIGN_ACCOUNT_ID,
            privateKeyPath: './src/config/private.key'
        });

        // Read and validate the private key
        let privateKey;
        try {
            // Read the private key file
            const privateKeyContent = fs.readFileSync('./src/config/private.key', 'utf8');
            
            // Log the raw key content (first and last few characters only)
            console.log('Raw private key content:', {
                firstChars: privateKeyContent.substring(0, 50) + '...',
                lastChars: '...' + privateKeyContent.substring(privateKeyContent.length - 50),
                totalLength: privateKeyContent.length
            });

            // Check if the key is in PKCS#1 or PKCS#8 format
            const isPKCS1 = privateKeyContent.includes('-----BEGIN RSA PRIVATE KEY-----');
            const isPKCS8 = privateKeyContent.includes('-----BEGIN PRIVATE KEY-----');
            
            console.log('Private key format check:', {
                isPKCS1,
                isPKCS8,
                hasBeginMarker: isPKCS1 || isPKCS8,
                hasEndMarker: privateKeyContent.includes('-----END RSA PRIVATE KEY-----') || 
                            privateKeyContent.includes('-----END PRIVATE KEY-----')
            });

            if (!isPKCS1 && !isPKCS8) {
                throw new Error('Invalid private key format. Must be in PKCS#1 or PKCS#8 PEM format');
            }

            // Clean up the private key
            // 1. Remove any whitespace and newlines
            // 2. Ensure proper line endings
            // 3. Keep the BEGIN and END markers
            privateKey = privateKeyContent
                .split('\n')
                .filter(line => line.trim() && !line.startsWith('-----'))
                .join('')
                .trim();

            // Add back the proper headers based on the format
            if (isPKCS1) {
                privateKey = `-----BEGIN RSA PRIVATE KEY-----\n${privateKey}\n-----END RSA PRIVATE KEY-----`;
            } else {
                privateKey = `-----BEGIN PRIVATE KEY-----\n${privateKey}\n-----END PRIVATE KEY-----`;
            }

            // Log the processed key format
            console.log('Processed private key format:', {
                format: isPKCS1 ? 'PKCS#1' : 'PKCS#8',
                hasProperHeaders: privateKey.includes('-----BEGIN') && privateKey.includes('-----END'),
                keyLength: privateKey.length
            });

        } catch (error) {
            console.error('Error reading or validating private key:', error);
            throw new Error(`Failed to read or validate private key: ${error.message}`);
        }

        const integratorKey = process.env.DOCUSIGN_INTEGRATOR_KEY;
        const userId = process.env.DOCUSIGN_USER_ID;
        
        // Use the correct scope for JWT Grant
        const scopes = ['signature', 'impersonation'];
        const expiresIn = 3600; // 1 hour

        // Log the request parameters
        console.log('Preparing JWT token request with:', {
            integratorKey,
            userId,
            scopes,
            expiresIn,
            privateKeyFormat: privateKey.includes('RSA PRIVATE KEY') ? 'PKCS#1' : 'PKCS#8',
            oAuthBasePath: apiClient.getOAuthBasePath()
        });

        try {
            // Generate the JWT token
            console.log('Attempting to generate JWT token...');
            const response = await apiClient.requestJWTUserToken(
                integratorKey,
                userId,
                scopes,
                privateKey,
                expiresIn
            );

            // Log the response details
            console.log('JWT token response:', {
                hasResponse: !!response,
                hasBody: !!response?.body,
                hasToken: !!response?.body?.access_token,
                responseKeys: response ? Object.keys(response) : [],
                bodyKeys: response?.body ? Object.keys(response.body) : []
            });

            if (!response?.body?.access_token) {
                throw new Error('Invalid response from DocuSign authentication service - no access token received');
            }

            const accessToken = response.body.access_token;
            console.log('Successfully generated access token');
            return accessToken;

        } catch (tokenError) {
            // Log detailed error information
            console.error('Token generation error details:', {
                error: tokenError.message,
                response: tokenError.response?.data,
                status: tokenError.response?.status,
                statusText: tokenError.response?.statusText,
                headers: tokenError.response?.headers,
                request: {
                    url: tokenError.config?.url,
                    method: tokenError.config?.method,
                    headers: Object.keys(tokenError.config?.headers || {}),
                    baseURL: tokenError.config?.baseURL
                }
            });

            // Check for specific error conditions
            if (tokenError.response?.data?.error) {
                const errorMessage = tokenError.response.data.error_description || tokenError.response.data.error;
                switch (tokenError.response.data.error) {
                    case 'invalid_grant':
                        throw new Error(`Invalid grant: ${errorMessage}. Please check your Integrator Key, User ID, and private key.`);
                    case 'invalid_client':
                        throw new Error(`Invalid client: ${errorMessage}. Please check your Integrator Key.`);
                    case 'invalid_request':
                        throw new Error(`Invalid request: ${errorMessage}. Please check your JWT token configuration.`);
                    case 'invalid_scope':
                        throw new Error(`Invalid scope: ${errorMessage}. The requested scope is not allowed.`);
                    default:
                        throw new Error(`DocuSign API error: ${errorMessage}`);
                }
            }

            // If we don't have a specific error from DocuSign, throw a more generic error
            throw new Error(`Failed to generate JWT token: ${tokenError.message}`);
        }
    } catch (error) {
        console.error('Error in generateAccessToken:', {
            error: error.message,
            code: error.code,
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data,
            stack: error.stack
        });
        throw error;
    }
}

// Modify the /send-docusign endpoint to handle account status errors
adminRouter.get('/send-docusign', async (req, res) => {
    try {
        const { investorType, userData, companyData } = req.query;

        if (!investorType && (!userData || !companyData)) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }

        try {
            // Check account status first
            await checkDocuSignAccountStatus();
        } catch (accountError) {
            console.error('DocuSign account status check failed:', accountError);
            return res.status(503).json({
                error: 'DocuSign account is not available',
                details: accountError.message,
                action: 'Please verify your DocuSign developer account status or contact support to renew your account.',
                retryAfter: 60
            });
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