import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

const getKYCStatus = async (email) => {
    try {
        if (!email || typeof email !== 'string') {
            return {
                success: false,
                message: 'Invalid email provided',
                status: 'invalid_input'
            };
        }

        // Query the kyc_applications table using the email from contact_info
        const { data, error } = await supabase
            .from('kyc_applications')
            .select(`
                id,
                status,
                created_at,
                updated_at,
                contact_info,
                investor_type,
                investor_details
            `)
            .contains('contact_info', { email: email })
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                // No record found
                return {
                    success: false,
                    message: 'No KYC application found for this email',
                    status: 'not applied'
                };
            }
            
            // Log the specific error for debugging
            console.error('Database query error:', {
                code: error.code,
                message: error.message,
                details: error.details
            });

            return {
                success: false,
                message: 'Error querying KYC application',
                status: 'database_error',
                error: {
                    code: error.code,
                    message: error.message
                }
            };
        }

        // If we found a record, return the status and relevant details
        return {
            success: true,
            data: {
                applicationId: data.id,
                status: data.status || 'pending',
            }
        };

    } catch (error) {
        // Log the full error for debugging
        console.error('Error fetching KYC status:', {
            error: error,
            email: email
        });

        return {
            success: false,
            message: 'Failed to fetch KYC application status',
            status: 'server_error',
            error: {
                message: error.message
            }
        };
    }
};

export default getKYCStatus;    