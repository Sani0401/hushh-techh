import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import { v4 as uuidv4 } from 'uuid';

// Initialize Supabase client
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Configure nodemailer transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD
    }
});

// Helper functions
const getFileExtension = (filename) => filename.split('.').pop().toLowerCase();
const sanitizeFilename = (filename) => filename.replace(/[^a-zA-Z0-9-_.]/g, '_');
const getDocumentUrl = (storagePath) => {
    const { data } = supabase.storage.from('kyc-documents').getPublicUrl(storagePath);
    return data.publicUrl;
};

// Document upload helper with retry logic
const uploadFile = async (file, userEmail, fieldName, index = 0, retryCount = 0) => {
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 2000; // 2 seconds

    try {
        const fileExt = getFileExtension(file.originalname);
        const sanitizedDocType = sanitizeFilename(fieldName);
        const timestamp = new Date().getTime();
        const fileName = `${sanitizedDocType}_${timestamp}${index > 0 ? `_${index}` : ''}.${fileExt}`;
        const userFolder = userEmail;
        
        const { data, error } = await supabase.storage
            .from('kyc-documents')
            .upload(`${userFolder}/${fileName}`, file.buffer, {
                contentType: file.mimetype,
                upsert: false
            });

        if (error) {
            // If it's a network error and we haven't exceeded retry limit
            if (error.message.includes('fetch failed') && retryCount < MAX_RETRIES) {
                console.log(`Retrying upload for ${file.originalname}. Attempt ${retryCount + 1} of ${MAX_RETRIES}`);
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
                return uploadFile(file, userEmail, fieldName, index, retryCount + 1);
            }
            throw error;
        }

        return {
            url: data.path,
            fileName: file.originalname,
            documentType: fieldName,
            mimeType: file.mimetype,
            fileSize: file.size,
            uploadedAt: new Date().toISOString(),
            storagePath: `${userFolder}/${fileName}`
        };
    } catch (error) {
        console.error(`Error uploading file ${file.originalname}:`, error);
        
        // If it's a network error and we haven't exceeded retry limit
        if (error.cause?.code === 'UND_ERR_CONNECT_TIMEOUT' && retryCount < MAX_RETRIES) {
            console.log(`Retrying upload for ${file.originalname} due to timeout. Attempt ${retryCount + 1} of ${MAX_RETRIES}`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            return uploadFile(file, userEmail, fieldName, index, retryCount + 1);
        }

        // If we've exhausted retries or it's a different error
        if (retryCount >= MAX_RETRIES) {
            throw new Error(`Failed to upload ${file.originalname} after ${MAX_RETRIES} attempts. Please check your internet connection and try again.`);
        }
        
        throw error;
    }
};

// Email template helpers
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

// Function to create action buttons HTML for admin email
const createActionButtonsHTML = (applicationId, email) => {
    const baseUrl = process.env.ADMIN_DASHBOARD_URL || 'http://localhost:3000';
    const apiUrl = `${baseUrl}/api/admin/kyc-verification-status`;
    
    return `
        <div style="margin: 20px 0; text-align: center;">
            <p style="margin-bottom: 10px; font-weight: bold;">Quick Actions:</p>
            <div style="display: inline-block; margin: 0 10px;">
                <a href="${apiUrl}?email=${encodeURIComponent(email)}&status=approved" 
                   style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin: 5px; display: inline-block;">
                    Approve KYC
                </a>
            </div>
            <div style="display: inline-block; margin: 0 10px;">
                <a href="${apiUrl}?email=${encodeURIComponent(email)}&status=rejected" 
                   style="background-color: #f44336; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin: 5px; display: inline-block;">
                    Reject KYC
                </a>
            </div>
            <div style="display: inline-block; margin: 0 10px;">
                <a href="${apiUrl}?email=${encodeURIComponent(email)}&status=pending" 
                   style="background-color: #2196F3; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin: 5px; display: inline-block;">
                    Mark for Review
                </a>
            </div>
        </div>
        <div style="margin: 20px 0; font-size: 12px; color: #666;">
            <p>Note: Clicking these links will directly update the KYC status. Please review the application carefully before taking action.</p>
            <p>After clicking, you will be redirected to a confirmation page.</p>
        </div>
    `;
};

// Update the createEmailTemplate function to include action buttons for admin
const createEmailTemplate = (applicationId, investorType, investorDetails, documents, isAdmin = false, email = '') => {
    const investorDetailsHTML = createInvestorDetailsHTML(investorType, investorDetails);
    const documentListHTML = createDocumentListHTML(documents);
    const actionButtonsHTML = isAdmin ? createActionButtonsHTML(applicationId, email) : '';

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background-color: #f8f9fa; padding: 20px; text-align: center; }
                .content { padding: 20px; }
                .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
                table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
                th { background-color: #f8f9fa; }
                .status { 
                    display: inline-block;
                    padding: 5px 10px;
                    border-radius: 3px;
                    font-weight: bold;
                    background-color: #e9ecef;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h2>KYC Application ${isAdmin ? 'Notification' : 'Confirmation'}</h2>
                    <p>Application ID: ${applicationId}</p>
                </div>
                
                <div class="content">
                    <p>${isAdmin ? 'A new KYC application has been submitted.' : 'Thank you for submitting your KYC application.'}</p>
                    
                    <h3>Application Details</h3>
                    <p><strong>Investor Type:</strong> ${investorType}</p>
                    <p><strong>Submission Date:</strong> ${new Date().toLocaleString()}</p>
                    
                    <h3>Investor Information</h3>
                    ${investorDetailsHTML}
                    
                    <h3>Submitted Documents</h3>
                    ${documentListHTML}

                    ${actionButtonsHTML}
                    
                    <h3>${isAdmin ? 'Next Steps' : 'What happens next?'}</h3>
                    ${isAdmin ? `
                        <p>Please review the application and documents carefully. You can use the action buttons above to update the application status.</p>
                        <p>For any questions or concerns, please contact the compliance team.</p>
                    ` : `
                        <p>Our team will review your application and documents. We will contact you if we need any additional information.</p>
                        <p>You will receive email notifications about the status of your application.</p>
                    `}
                </div>
                
                <div class="footer">
                    <p>This is an automated message. Please do not reply to this email.</p>
                    <p>For support, please contact our compliance team.</p>
                </div>
            </div>
        </body>
        </html>
    `;
};

// Main service functions
class KYCService {
    // Submit KYC Application
    static async submitKYCApplication(req) {
        try {
            const {
                investorType,
                contactInfo,
                declarations,
                eddScreening,
                investorDetails,
                beneficialOwners,
                authorizedSignatories
            } = req.body;

            // Process file uploads
            const documents = {};
            if (req.files) {
                await Promise.all(
                    Object.entries(req.files).map(async ([fieldName, fileArray]) => {
                        const uploadPromises = fileArray.map(async (file, index) => {
                            const documentRef = await uploadFile(file, contactInfo.email, fieldName, index);
                            
                            if (fieldName === 'beneficialOwnerIds' || fieldName === 'financialDocuments') {
                                if (!documents[fieldName]) documents[fieldName] = [];
                                documents[fieldName].push(documentRef);
                            } else {
                                documents[fieldName] = documentRef;
                            }
                        });
                        return Promise.all(uploadPromises);
                    })
                );
            }

            // Prepare KYC data
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
                    documents
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

            // Insert into database
            const { data: kycApplication, error: kycError } = await supabase
                .from('kyc_applications')
                .insert({
                    ...kycData,
                    documents: kycData.investor_details.documents,
                    status: 'pending'  // Explicitly set initial status
                })
                .select()
                .single();

            if (kycError) throw kycError;

            // Send confirmation emails
            await this.sendConfirmationEmails(contactInfo, kycApplication.id, investorType, investorDetails, documents);

            return {
                success: true,
                applicationId: kycApplication.id,
                documents
            };

        } catch (error) {
            console.error('KYC Application Error:', error);
            throw error;
        }
    }

    // Get KYC Application Status
    static async getKYCApplicationStatus(applicationId) {
        try {
            const { data, error } = await supabase
                .from('kyc_applications')
                .select('*')
                .eq('id', applicationId)
                .single();

            if (error) throw error;

            return {
                success: true,
                data
            };

        } catch (error) {
            console.error('Error fetching KYC application:', error);
            throw error;
        }
    }

    // Send confirmation emails
    static async sendConfirmationEmails(contactInfo, applicationId, investorType, investorDetails, documents) {
        try {
            const adminMailOptions = {
                from: process.env.EMAIL_FROM,
                to: process.env.ADMIN_EMAIL,
                subject: `New KYC Application Submission - ${applicationId}`,
                html: createEmailTemplate(applicationId, investorType, investorDetails, documents, true, contactInfo.email)
            };

            const applicantMailOptions = {
                from: process.env.EMAIL_FROM,
                to: contactInfo.email,
                subject: 'KYC Application Submission Confirmation',
                html: createEmailTemplate(applicationId, investorType, investorDetails, documents, false)
            };

            await Promise.all([
                transporter.sendMail(adminMailOptions),
                transporter.sendMail(applicantMailOptions)
            ]);

            return true;
        } catch (error) {
            console.error('Error sending confirmation emails:', error);
            return false;
        }
    }
}

export default KYCService; 