import express, { Router } from "express";
import { createClient } from '@supabase/supabase-js';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import nodemailer from 'nodemailer';

const adminRouter = express.Router();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Configure nodemailer transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD // Use App Password for Gmail
    }
});

// Function to create investor details HTML based on type
const createInvestorDetailsHTML = (investorType, investorDetails) => {
    if (investorType === 'individual') {
        return `
            <h3 style="color: #444;">Individual Investor Details:</h3>
            <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
                <tr>
                    <td style="padding: 8px; border: 1px solid #ddd;"><strong>Full Legal Name:</strong></td>
                    <td style="padding: 8px; border: 1px solid #ddd;">${investorDetails.fullLegalName}</td>
                </tr>
                <tr>
                    <td style="padding: 8px; border: 1px solid #ddd;"><strong>Date of Birth:</strong></td>
                    <td style="padding: 8px; border: 1px solid #ddd;">${investorDetails.dateOfBirth}</td>
                </tr>
                <tr>
                    <td style="padding: 8px; border: 1px solid #ddd;"><strong>Nationality:</strong></td>
                    <td style="padding: 8px; border: 1px solid #ddd;">${investorDetails.nationality}</td>
                </tr>
                <tr>
                    <td style="padding: 8px; border: 1px solid #ddd;"><strong>ID Type:</strong></td>
                    <td style="padding: 8px; border: 1px solid #ddd;">${investorDetails.idType}</td>
                </tr>
                <tr>
                    <td style="padding: 8px; border: 1px solid #ddd;"><strong>ID Number:</strong></td>
                    <td style="padding: 8px; border: 1px solid #ddd;">${investorDetails.idNumber}</td>
                </tr>
                <tr>
                    <td style="padding: 8px; border: 1px solid #ddd;"><strong>ID Issuing Country:</strong></td>
                    <td style="padding: 8px; border: 1px solid #ddd;">${investorDetails.idIssuingCountry}</td>
                </tr>
                <tr>
                    <td style="padding: 8px; border: 1px solid #ddd;"><strong>Tax Residence Country:</strong></td>
                    <td style="padding: 8px; border: 1px solid #ddd;">${investorDetails.taxResidenceCountry}</td>
                </tr>
                <tr>
                    <td style="padding: 8px; border: 1px solid #ddd;"><strong>Tax ID Number:</strong></td>
                    <td style="padding: 8px; border: 1px solid #ddd;">${investorDetails.taxIdNumber}</td>
                </tr>
                <tr>
                    <td style="padding: 8px; border: 1px solid #ddd;"><strong>US Person:</strong></td>
                    <td style="padding: 8px; border: 1px solid #ddd;">${investorDetails.isUsPerson ? 'Yes' : 'No'}</td>
                </tr>
                <tr>
                    <td style="padding: 8px; border: 1px solid #ddd;"><strong>Source of Funds:</strong></td>
                    <td style="padding: 8px; border: 1px solid #ddd;">${investorDetails.sourceOfFundsDescription}</td>
                </tr>
            </table>
        `;
    } else {
        return `
            <h3 style="color: #444;">Institutional Investor Details:</h3>
            <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
                <tr>
                    <td style="padding: 8px; border: 1px solid #ddd;"><strong>Legal Entity Name:</strong></td>
                    <td style="padding: 8px; border: 1px solid #ddd;">${investorDetails.legalEntityName}</td>
                </tr>
                <tr>
                    <td style="padding: 8px; border: 1px solid #ddd;"><strong>Registration Number:</strong></td>
                    <td style="padding: 8px; border: 1px solid #ddd;">${investorDetails.registrationNumber}</td>
                </tr>
                <tr>
                    <td style="padding: 8px; border: 1px solid #ddd;"><strong>Incorporation Date:</strong></td>
                    <td style="padding: 8px; border: 1px solid #ddd;">${investorDetails.incorporationDate}</td>
                </tr>
                <tr>
                    <td style="padding: 8px; border: 1px solid #ddd;"><strong>Jurisdiction:</strong></td>
                    <td style="padding: 8px; border: 1px solid #ddd;">${investorDetails.jurisdiction}</td>
                </tr>
                <tr>
                    <td style="padding: 8px; border: 1px solid #ddd;"><strong>Nature of Business:</strong></td>
                    <td style="padding: 8px; border: 1px solid #ddd;">${investorDetails.natureOfBusiness}</td>
                </tr>
                <tr>
                    <td style="padding: 8px; border: 1px solid #ddd;"><strong>Source of Funds:</strong></td>
                    <td style="padding: 8px; border: 1px solid #ddd;">${investorDetails.sourceOfFundsDescription}</td>
                </tr>
            </table>

            ${investorDetails.beneficialOwners ? `
                <h3 style="color: #444; margin-top: 20px;">Beneficial Owners:</h3>
                ${investorDetails.beneficialOwners.map((owner, index) => `
                    <div style="margin: 15px 0; padding: 15px; background-color: #f9f9f9; border-radius: 5px;">
                        <h4 style="margin: 0 0 10px 0;">Beneficial Owner ${index + 1}</h4>
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 8px; border: 1px solid #ddd;"><strong>Name:</strong></td>
                                <td style="padding: 8px; border: 1px solid #ddd;">${owner.fullLegalName}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px; border: 1px solid #ddd;"><strong>Ownership Percentage:</strong></td>
                                <td style="padding: 8px; border: 1px solid #ddd;">${owner.ownershipPercentage}%</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px; border: 1px solid #ddd;"><strong>Nationality:</strong></td>
                                <td style="padding: 8px; border: 1px solid #ddd;">${owner.nationality}</td>
                            </tr>
                        </table>
                    </div>
                `).join('')}
            ` : ''}

            ${investorDetails.authorizedSignatories ? `
                <h3 style="color: #444; margin-top: 20px;">Authorized Signatories:</h3>
                ${investorDetails.authorizedSignatories.map((signatory, index) => `
                    <div style="margin: 10px 0;">
                        <strong>${signatory.fullLegalName}</strong> - ${signatory.position}
                    </div>
                `).join('')}
            ` : ''}
        `;
    }
};

// Function to get Supabase document URL
const getDocumentUrl = (storagePath) => {
    const { data } = supabase.storage
        .from('kyc-documents')
        .getPublicUrl(storagePath);
    return data.publicUrl;
};

// Function to create document list HTML
const createDocumentListHTML = (documents) => {
    const documentTypes = {
        idDocument: 'Government ID',
        addressProof: 'Proof of Address',
        taxForm: 'Tax Form',
        sourceOfFundsDoc: 'Source of Funds Document',
        articlesOfIncorporation: 'Articles of Incorporation',
        operatingAgreement: 'Operating Agreement',
        certificateOfGoodStanding: 'Certificate of Good Standing',
        financialDocuments: 'Financial Documents',
        beneficialOwnerIds: 'Beneficial Owner IDs',
        authorizationDocument: 'Authorization Document'
    };

    return `
        <h3 style="color: #444; margin-top: 20px;">Submitted Documents:</h3>
        <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
            <tr style="background-color: #f5f5f5;">
                <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Document Type</th>
                <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">File Name</th>
                <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Upload Date</th>
                <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Link</th>
            </tr>
            ${Object.entries(documents).map(([type, doc]) => {
                if (!doc) return '';
                if (Array.isArray(doc)) {
                    return doc.map((d, index) => `
                        <tr>
                            <td style="padding: 8px; border: 1px solid #ddd;">${documentTypes[type]} ${index + 1}</td>
                            <td style="padding: 8px; border: 1px solid #ddd;">${d.fileName}</td>
                            <td style="padding: 8px; border: 1px solid #ddd;">${new Date(d.uploadedAt).toLocaleString()}</td>
                            <td style="padding: 8px; border: 1px solid #ddd;">
                                <a href="${getDocumentUrl(d.storagePath)}" target="_blank" style="color: #0066cc; text-decoration: none;">
                                    View Document
                                </a>
                            </td>
                        </tr>
                    `).join('');
                }
                return `
                    <tr>
                        <td style="padding: 8px; border: 1px solid #ddd;">${documentTypes[type]}</td>
                        <td style="padding: 8px; border: 1px solid #ddd;">${doc.fileName}</td>
                        <td style="padding: 8px; border: 1px solid #ddd;">${new Date(doc.uploadedAt).toLocaleString()}</td>
                        <td style="padding: 8px; border: 1px solid #ddd;">
                            <a href="${getDocumentUrl(doc.storagePath)}" target="_blank" style="color: #0066cc; text-decoration: none;">
                                View Document
                            </a>
                        </td>
                    </tr>
                `;
            }).join('')}
        </table>
    `;
};

// Email template for KYC submission confirmation
const createEmailTemplate = (contactInfo, applicationId, investorType, investorDetails, documents) => {
    return `
        <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
            <h2 style="color: #333;">KYC Application Submission Confirmation</h2>
            <p>Dear ${contactInfo.name},</p>
            <p>Thank you for submitting your KYC application to Hushh Renaissance Aloha & Alpha Fund, LP. We have received your application and all associated documents.</p>
            
            <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <h3 style="color: #444; margin-top: 0;">Application Details:</h3>
                <p><strong>Application ID:</strong> ${applicationId}</p>
                <p><strong>Submission Date:</strong> ${new Date().toLocaleString()}</p>
                <p><strong>Investor Type:</strong> ${investorType === 'individual' ? 'Individual Investor' : 'Institutional Investor'}</p>
            </div>

            ${createInvestorDetailsHTML(investorType, investorDetails)}
            ${createDocumentListHTML(documents)}

            <div style="margin: 20px 0;">
                <h3 style="color: #444;">Next Steps:</h3>
                <ul>
                    <li>Our compliance team will review your application</li>
                    <li>You will receive an email once the review is complete</li>
                    <li>If additional information is needed, we will contact you</li>
                </ul>
            </div>

            <p>You can check the status of your application at any time using your Application ID: <strong>${applicationId}</strong></p>

            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
                <p style="color: #666; font-size: 0.9em;">If you have any questions, please contact our Investor Relations team at <a href="mailto:ir@hushh.ai">ir@hushh.ai</a></p>
            </div>

            <div style="margin-top: 20px; font-size: 0.8em; color: #888;">
                <p>This is an automated message. Please do not reply to this email.</p>
                <p>Hushh Renaissance Aloha & Alpha Fund, LP</p>
            </div>
        </div>
    `;
};

// Function to convert Blob to Buffer
const blobToBuffer = async (blob) => {
    const arrayBuffer = await blob.arrayBuffer();
    return Buffer.from(arrayBuffer);
};

// Function to send confirmation email
const sendConfirmationEmail = async (contactInfo, applicationId, investorType, investorDetails, documents) => {
    try {
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: contactInfo.email,
            subject: 'KYC Application Submission Confirmation - Hushh Renaissance Aloha & Alpha Fund, LP',
            html: createEmailTemplate(contactInfo, applicationId, investorType, investorDetails, documents)
        };

        // Send email to applicant
        await transporter.sendMail(mailOptions);

        // Send notification to admin
        const adminMailOptions = {
            from: process.env.EMAIL_USER,
            to: process.env.ADMIN_EMAIL,
            subject: `New KYC Application Received - ${applicationId}`,
            html: `
                <div style="font-family: Arial, sans-serif;">
                    <h2>New KYC Application Received</h2>
                    <p>A new KYC application has been submitted:</p>
                    <ul>
                        <li><strong>Application ID:</strong> ${applicationId}</li>
                        <li><strong>Applicant Name:</strong> ${contactInfo.name}</li>
                        <li><strong>Applicant Email:</strong> ${contactInfo.email}</li>
                        <li><strong>Investor Type:</strong> ${investorType === 'individual' ? 'Individual Investor' : 'Institutional Investor'}</li>
                        <li><strong>Submission Date:</strong> ${new Date().toLocaleString()}</li>
                    </ul>
                    ${createInvestorDetailsHTML(investorType, investorDetails)}
                    ${createDocumentListHTML(documents)}
                    <p>Please review the application in the admin dashboard.</p>
                </div>
            `
        };

        await transporter.sendMail(adminMailOptions);
        return true;
    } catch (error) {
        console.error('Email sending error:', error);
        return false;
    }
};

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    }
});

// Helper function to get file extension
const getFileExtension = (filename) => {
    return filename.split('.').pop().toLowerCase();
};

// Helper function to sanitize filename
const sanitizeFilename = (filename) => {
    return filename.replace(/[^a-zA-Z0-9-_.]/g, '_');
};

// Initialize empty documents object
const createEmptyDocumentsObject = () => ({
    idDocument: null,
    addressProof: null,
    taxForm: null,
    sourceOfFundsDoc: null,
    articlesOfIncorporation: null,
    operatingAgreement: null,
    certificateOfGoodStanding: null,
    financialDocuments: null,
    beneficialOwnerIds: null,
    authorizationDocument: null
});

// Submit KYC Application
adminRouter.post("/kyc-verification", upload.fields([
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
]), async (req, res) => {
    try {
        // Parse JSON strings from form data
        const investorType = req.body.investorType;
        const contactInfo = JSON.parse(req.body.contactInfo);
        const declarations = JSON.parse(req.body.declarations);
        const eddScreening = JSON.parse(req.body.eddScreening);
        const investorDetails = JSON.parse(req.body.investorDetails);
        const beneficialOwners = req.body.beneficialOwners ? JSON.parse(req.body.beneficialOwners) : null;
        const authorizedSignatories = req.body.authorizedSignatories ? JSON.parse(req.body.authorizedSignatories) : null;

        // Initialize documents object with null values
        const documents = createEmptyDocumentsObject();

        // Handle file uploads and create document references
        if (req.files) {
            await Promise.all(
                Object.entries(req.files).map(async ([fieldName, files]) => {
                    const uploadPromises = files.map(async (file, index) => {
                        const fileExt = getFileExtension(file.originalname);
                        const sanitizedDocType = sanitizeFilename(fieldName);
                        const timestamp = new Date().getTime();
                        // Create filename with document type and timestamp
                        const fileName = `${sanitizedDocType}_${timestamp}${index > 0 ? `_${index}` : ''}.${fileExt}`;
                        
                        // Create user's folder path using email
                        const userFolder = `${contactInfo.email}`;
                        
                        const { data, error } = await supabase.storage
                            .from('kyc-documents')
                            .upload(`${userFolder}/${fileName}`, file.buffer, {
                                contentType: file.mimetype,
                                upsert: false
                            });

                        if (error) throw error;

                        // Create document reference with more metadata
                        const documentRef = {
                            url: data.path,
                            fileName: file.originalname,
                            documentType: fieldName,
                            mimeType: file.mimetype,
                            fileSize: file.size,
                            uploadedAt: new Date().toISOString(),
                            storagePath: `${userFolder}/${fileName}`
                        };

                        // Handle multiple files for the same type
                        if (fieldName === 'beneficialOwnerIds' || fieldName === 'financialDocuments') {
                            if (!documents[fieldName]) {
                                documents[fieldName] = [];
                            }
                            documents[fieldName].push(documentRef);
                        } else {
                            documents[fieldName] = documentRef;
                        }

                        return data.path;
                    });
                    return Promise.all(uploadPromises);
                })
            );
        }

        // Prepare the data for insertion
        const kycData = {
            investor_type: investorType,
            contact_info: {
                name: contactInfo.name,
                email: contactInfo.email,
                phone: contactInfo.phone
            },
            declarations: Array.isArray(declarations) ? declarations.map(d => ({
                id: d.id,
                text: d.text,
                accepted: d.accepted,
                acceptedAt: d.accepted ? new Date().toISOString() : null
            })) : [],
            edd_screening: {
                isPep: eddScreening.isPep,
                pepDetails: eddScreening.pepDetails,
                isHighRiskJurisdiction: eddScreening.isHighRiskJurisdiction,
                highRiskJurisdictionDetails: eddScreening.highRiskJurisdictionDetails,
                investmentAmountExceeds10m: eddScreening.investmentAmountExceeds10m,
                hasComplexStructure: eddScreening.hasComplexStructure,
                complexStructureDetails: eddScreening.complexStructureDetails
            },
            investor_details: {
                ...investorDetails,
                documents: documents // Store documents within investor_details
            }
        };

        // Add institutional-specific data if applicable
        if (investorType === 'institutional') {
            kycData.beneficial_owners = beneficialOwners?.map((owner, index) => ({
                ...owner,
                idDocument: documents.beneficialOwnerIds?.[index] || null
            })) || [];

            kycData.authorized_signatories = authorizedSignatories?.map(signatory => ({
                ...signatory,
                authorizationDocument: documents.authorizationDocument || null
            })) || [];
        }

        // Insert the KYC application
        const { data: kycApplication, error: kycError } = await supabase
            .from('kyc_applications')
            .insert({
                investor_type: kycData.investor_type,
                contact_info: kycData.contact_info,
                declarations: kycData.declarations,
                edd_screening: kycData.edd_screening,
                investor_details: kycData.investor_details,
                beneficial_owners: kycData.beneficial_owners,
                authorized_signatories: kycData.authorized_signatories,
                documents:{}
            })
            .select()
            .single();

        if (kycError) throw kycError;

        // After successful database insertion
        if (kycApplication) {
            // Send confirmation email with all details
            const emailSent = await sendConfirmationEmail(
                contactInfo,
                kycApplication.id,
                investorType,
                investorDetails,
                documents
            );
            
            res.status(201).json({
                success: true,
                message: 'KYC application submitted successfully',
                applicationId: kycApplication.id,
                emailSent: emailSent
            });
        } else {
            throw new Error('Failed to create KYC application');
        }

    } catch (error) {
        console.error('KYC Verification Error:', error);
        res.status(500).json({
            success: false,
            message: 'Error processing KYC application',
            error: error.message
        });
    }
});

// Get KYC Application Status
adminRouter.get("/kyc-verification/:applicationId", async (req, res) => {
    try {
        const { applicationId } = req.params;
        
        const { data, error } = await supabase
            .from('kyc_applications')
            .select('*')
            .eq('id', applicationId)
            .single();

        if (error) throw error;

        res.json({
            success: true,
            data
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching KYC application',
            error: error.message
        });
    }
});

export default adminRouter;