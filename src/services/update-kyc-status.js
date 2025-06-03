import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

const updateKYCStatus = async (email, status) => {
    try {
        if (!email || typeof email !== 'string') {
            return {
                success: false,
                message: 'Invalid email provided',
                status: 'invalid_input'
            };
        }

        if (!status || typeof status !== 'string') {
            return {
                success: false,
                message: 'Invalid status provided',
                status: 'invalid_input'
            };
        }

        // First, let's check if the record exists
        const { data: existingRecord, error: checkError } = await supabase
            .from('kyc_applications')
            .select('id, contact_info')
            .filter('contact_info->>email', 'eq', email)
            .single();

        console.log('Existing record check:', { existingRecord, checkError, email });

        if (checkError) {
            if (checkError.code === 'PGRST116') {
                return {
                    success: false,
                    message: 'No KYC application found for this email',
                    status: 'not_found'
                };
            }
            throw checkError;
        }

        // If we found the record, proceed with update
        const { data, error } = await supabase
            .from('kyc_applications')
            .update({ 
                status: status,
                updated_at: new Date().toISOString()
            })
            .eq('id', existingRecord.id)
            .select()
            .single();

        console.log('Update result:', { data, error });

        if (error) {
            console.error('Database update error:', {
                code: error.code,
                message: error.message,
                details: error.details
            });

            return {
                success: false,
                message: 'Error updating KYC application status',
                status: 'database_error',
                error: {
                    code: error.code,
                    message: error.message
                }
            };
        }

        return {
            success: true,
            message: 'KYC application status updated successfully',
            data: {
                applicationId: data.id,
                status: data.status,
                updatedAt: data.updated_at
            }
        };

    } catch (error) {
        console.error('Error updating KYC status:', {
            error: error,
            email: email,
            status: status
        });

        return {
            success: false,
            message: 'Failed to update KYC application status',
            status: 'server_error',
            error: {
                message: error.message
            }
        };
    }
};

export default updateKYCStatus;    