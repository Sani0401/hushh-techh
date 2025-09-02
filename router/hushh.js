
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import path from "path";
import { v4 as uuidv4 } from "uuid";
import express from "express";
import multer from "multer";
import questions from "../src/config/hushh_preference_questionaire.js";
const hushhRouter = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Initialize Supabase client
const supabase = createClient(process.env.SUPABASE_HUSHH_URL, process.env.SUPABASE_HUSHH_ANON_KEY);

// 1. API to add data and convert to embedding using OpenAI model
hushhRouter.post("/add-data", async (req, res) => {
    try {
        const { content, metadata, category } = req.body;

        if (!content) {
            return res.status(400).json({
                success: false,
                message: 'Content is required'
            });
        }

        // Generate embedding using OpenAI
        const embeddingResponse = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: content,
            encoding_format: "float",
        });

        const embedding = embeddingResponse.data[0].embedding;
        
        // Ensure embedding is an array of numbers
        if (!Array.isArray(embedding)) {
            throw new Error('Invalid embedding format received from OpenAI');
        }
        
        // Log embedding details for debugging
        console.log('Embedding details:', {
            type: typeof embedding,
            isArray: Array.isArray(embedding),
            length: embedding.length,
            firstFew: embedding.slice(0, 3),
            lastFew: embedding.slice(-3)
        });

        // Store data and embedding in Supabase
        const { data, error } = await supabase
            .from('hushh_knowledge_base')
            .insert([
                {
                    content: content,
                    embedding: embedding,
                    metadata: metadata || {},
                    category: category || 'general',
                    created_at: new Date().toISOString()
                }
            ])
            .select();

        if (error) {
            console.error('Supabase insert error:', error);
            return res.status(500).json({
                success: false,
                message: 'Error storing data in database',
                error: error.message
            });
        }

        res.status(201).json({
            success: true,
            message: 'Data added successfully with embedding',
            data: data[0]
        });

    } catch (error) {
        console.error('Error adding data:', error);
        res.status(500).json({
            success: false,
            message: 'Error processing request',
            error: error.message
        });
    }
});

// 2. Chat API to respond to queries about Hushh products
hushhRouter.post("/chat", async (req, res) => {
    try {
        const { query, conversation_history = [] } = req.body;

        if (!query) {
            return res.status(400).json({
                success: false,
                message: "Query is required",
            });
        }

        // Generate embedding for the user query
        const queryEmbedding = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: query,
            encoding_format: "float",
        });

        // Search for similar content in the knowledge base
        let { data: similarContent, error: searchError } = await supabase.rpc(
            "match_documents",
            {
                query_embedding: queryEmbedding.data[0].embedding,
                match_threshold: 0.7,
                match_count: 5,
            }
        );

        if (searchError) {
            console.error("Vector search error:", searchError);

            // Fallback to keyword search if vector search fails
            const { data: fallbackData, error: fallbackError } = await supabase
                .from("hushh_knowledge_base")
                .select("content, metadata, category, url")
                .ilike("content", `%${query}%`)
                .limit(5);

            if (fallbackError) {
                console.error("Fallback search error:", fallbackError);
                return res.status(500).json({
                    success: false,
                    message: "Error searching knowledge base",
                    error: fallbackError.message,
                });
            }
            similarContent = fallbackData;
        }

        // Prepare context from similar content
        let context = "";
        if (similarContent && similarContent.length > 0) {
            context = similarContent.map((item) => item.content).join("\n\n");
        }

        // System prompt for chatbot
        const systemPrompt = `You are Hushh's AI Assistant, trained to answer queries about Hushh's products and services.

- Use the provided context as the main source of truth.
- If the context doesn’t fully answer, say so and provide general information about Hushh.
- Keep answers conversational, professional, and concise.
- If a source has a link, naturally include it in your response (e.g., "You can learn more here: <link>").
- Never make up links or information.

Context:
${context}`;

        // Build messages with history + current user query
        const messages = [
            { role: "system", content: systemPrompt },
            ...(conversation_history || []).map((exchange) => ({
                role: exchange.role,
                content: exchange.content,
            })),
            { role: "user", content: query },
        ];

        // Generate response using OpenAI
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages,
            max_tokens: 500,
            temperature: 0.7,
        });

        const response = completion.choices[0].message.content;

        // Extract any URLs present in the model's response
        const urlRegex = /(https?:\/\/[^\s)>"']+)/g;
        const responseLinks = Array.from(new Set((response.match(urlRegex) || [])));

        // Collect URLs from retrieved sources
        const sourceLinks = (similarContent || [])
            .map((item) => item?.metadata?.url || item?.url)
            .filter(Boolean);

        // Merge and de-duplicate
        const links = Array.from(new Set([...responseLinks, ...sourceLinks]));

        // Send response with sources and links
        res.json({
            success: true,
            response,
            links,
            sources: similarContent
                ? similarContent.map((item) => ({
                      content: item.content.substring(0, 120) + "...",
                      category: item.category,
                      metadata: item.metadata,
                      url: item.metadata?.url || item.url || null,
                  }))
                : [],
            conversation_id: Date.now().toString(),
        });
    } catch (error) {
        console.error("Chat API error:", error);
        res.status(500).json({
            success: false,
            message: "Error processing chat request",
            error: error.message,
        });
    }
});


hushhRouter.post("/user-data", async (req, res) => {
    try {
        const { email, name, gender, dob, phone_number, address, contact_source } = req.body;
        console.log(req.body);
        
        if (!email || !name || !gender || !dob || !phone_number || !address || !contact_source) {
            return res.status(400).json({
                success: false,
                message: "All fields are required",
            });
        }

        const { data, error } = await supabase
            .from("users")
            .update({
                email,
                name,
                gender,
                dob,
                phone_number,
                address,
                contact_source,
            })
            .eq("email", email)
            .select();

        console.log("Supabase response:", { data, error });

        if (error) {
            return res.status(500).json({
                success: false,
                message: "Error storing user data",
                error: error.message,
            });
        }

        if (!data || data.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No user found with this email to update",
            });
        }

        res.status(201).json({
            success: true,
            message: "User data stored successfully",
            data: data[0],
        });
    } catch (error) {
        console.error("User data exception:", error);
        res.status(500).json({
            success: false,
            message: "Error storing user data",
            error: error.message,
        });
    }
});

hushhRouter.post("/upload-images", upload.array("images", 10), async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: "Email is required",
            });
        }

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: false,
                message: "No images uploaded",
            });
        }

        const uploadedFiles = [];

        for (const file of req.files) {
            const ext = path.extname(file.originalname); // e.g. ".jpg"
            const uniqueName = `${uuidv4()}${ext}`;
            const filePath = `${email}/${uniqueName}`; // folder = email

            const { error } = await supabase.storage
                .from("hushh_profile_photos") // replace with your Supabase bucket name
                .upload(filePath, file.buffer, {
                    contentType: file.mimetype,
                    upsert: true, // overwrite if same path exists
                });

            if (error) {
                console.error("Upload error:", error);
                return res.status(500).json({
                    success: false,
                    message: "Error uploading image",
                    error: error.message,
                });
            }

            const { data: { publicUrl } } = supabase.storage
                .from("hushh_profile_photos")
                .getPublicUrl(filePath);

            uploadedFiles.push(publicUrl);
        }

        res.status(201).json({
            success: true,
            message: "Images uploaded successfully",
            files: uploadedFiles,
        });
    } catch (error) {
        console.error("Upload exception:", error);
        res.status(500).json({
            success: false,
            message: "Server error during upload",
            error: error.message,
        });
    }
});

hushhRouter.post("/user-socials", async(req,res) =>{
    try{
        const{instagram_id, linkedin_id, twitter_id, facebook_id, email} = req.body;
        const {data, error} = await supabase.from('users').update({
            social_media_link:[{instagram:instagram_id}, {linkedin:linkedin_id}, {twitter:twitter_id}, {facebook:facebook_id}]
        }).eq('email', email)
        .select();
        if(error){
            return res.status(500).json({
                success: false,
                message: "Error storing user socials",
                error: error.message,
            });
        }
        res.status(201).json({
            success: true,
            message: "User socials stored successfully",
            data: data[0],
        });
    }
    catch(error){
        console.error("User socials exception:", error);
        res.status(500).json({
            success: false,
            message: "Error storing user socials",
            error: error.message,
        });
    }
})


hushhRouter.get("/preference-question", async(req,res) =>{
    try{
      return res.status(200).json({
        success: true,
        message: "Preference questionaire fetched successfully",
        data: questions,
      });
    }catch(error){
      console.error("Preference questionaire exception:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching preference questionaire",
        error: error.message,
      });
    }
})


hushhRouter.post("/save-preferences", async (req, res) => {
    try {
      const { email, answers } = req.body;
    console.log(email);
    
      if (!email || !answers) {
        return res.status(400).json({
          success: false,
          message: "Email and answers are required",
        });
      }
  
      // Update user_preference JSON in users table
      const { data, error } = await supabase
        .from("users")
        .update({ user_preference: answers })
        .eq("email", email);

  
      if (error) {
        console.error("Preference save error:", error);
        return res.status(500).json({
          success: false,
          message: "Error saving preferences",
          error: error.message,
        });
      }
  
  
      res.status(200).json({
        success: true,
        message: "Preferences saved successfully"
      });
    } catch (error) {
      console.error("Preference save exception:", error);
      res.status(500).json({
        success: false,
        message: "Server error saving preferences",
        error: error.message,
      });
    }
  });
  hushhRouter.get("/user-details", async (req, res) => {
    try {
      const { email } = req.body;
      console.log(email);
  
      let user_details = {};
  
      // Get user data from "users" table
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("email", email);
  
      if (error) throw error;
  
      user_details.user_data = data;
  
      // Get profile pictures from Supabase storage
      const { data: profilePictureData, error: profilePictureError } =
        await supabase.storage.from("hushh_profile_photos").list(email);
  
      if (profilePictureError) {
        return res.status(500).json({
          success: false,
          message: "Error fetching user profile pictures",
          error: profilePictureError.message,
        });
      }
  
      // Generate public URLs for each image
      const profilePictureUrls = profilePictureData.map((file) => {
        const { data: publicUrlData } = supabase.storage
          .from("hushh_profile_photos")
          .getPublicUrl(`${email}/${file.name}`);
  
        return publicUrlData.publicUrl;
      });
  
      user_details.profile_pictures = profilePictureUrls;
  
      return res.status(200).json({
        success: true,
        message: "User details fetched successfully",
        data: user_details,
      });
    } catch (error) {
      console.error("User details exception:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching user details",
        error: error.message,
      });
    }
  });
  
export default hushhRouter;