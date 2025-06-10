import nodemailer from 'nodemailer';

// Configure nodemailer transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD
    }
});

const createNDAEmailTemplate = (investorType, data) => {
    if (!data || typeof data !== 'object') {
        return `
            <div>
                <p>No data provided.</p>
            </div>
        `;
    }

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
                .button { display: inline-block; padding: 10px 20px; margin-top: 20px; background-color: #007bff; color: #fff; text-decoration: none; border-radius: 5px; }
                .button:hover { background-color: #0056b3; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h2>New NDA Request</h2>
                    <p>Investor Type: ${investorType}</p>
                </div>
                
                <div class="content">
                    <h3>Investor Information</h3>
                    <table>
                        <tr>
                            <th>Field</th>
                            <th>Value</th>
                        </tr>
                        ${Object.entries(data).map(([key, value]) => `
    <tr>
        <td><strong>${key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</strong></td>
        <td>${typeof value === 'object' && value !== null
            ? Object.entries(value).map(([k, v]) => `${k}: ${v}`).join(', ')
            : value}
        </td>
    </tr>
`).join('')}
                    </table>
                    <a href="${process.env.BASE_URL}/api/admin/send-docusign?investorType=${encodeURIComponent(investorType)}&${investorType === 'institutional' ? `companyData=${encodeURIComponent(JSON.stringify(data))}` : `userData=${encodeURIComponent(JSON.stringify(data))}`}" class="button">Accept NDA</a>
                </div>
                
                <div class="footer">
                    <p>This is an automated message. Please do not reply to this email.</p>
                    <p>For support, please contact the compliance team.</p>
                </div>
            </div>
        </body>
        </html>
    `;
};

const sendNDA = async (req) => {
    try {
        const { investor_type, user_data, company_data } = req.body;

        console.log('Received investor_type:', investor_type);
        console.log('Received user_data:', user_data);
        console.log('Received company_data:', company_data);

        const data = user_data || company_data;

        console.log('Using data:', data);

        if (!investor_type || !data) {
            throw new Error('Investor type and user or company data are required');
        }

        const mailOptions = {
            from: process.env.EMAIL_FROM,
            to: process.env.ADMIN_EMAIL,
            subject: `New NDA Request - ${investor_type} Investor`,
            html: createNDAEmailTemplate(investor_type, data)
        };

        await transporter.sendMail(mailOptions);

        return {
            success: true,
            message: 'NDA request email sent successfully'
        };
    } catch (error) {
        console.error('Error sending NDA email:', error);
        throw error;
    }
};

export default sendNDA;