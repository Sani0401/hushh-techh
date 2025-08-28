import express, { Router } from "express";
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const hushhRouter = express.Router();

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

        let response = completion.choices[0].message.content;

        // Extract any URLs present in the model's response
        const urlRegex = /(https?:\/\/[^\s)>"']+)/g;
        const responseLinks = Array.from(new Set((response.match(urlRegex) || [])));

        // Remove URLs from the response text
        response = response.replace(urlRegex, "").trim();

        // Collect URLs from retrieved sources
        const sourceLinks = (similarContent || [])
            .map((item) => item?.metadata?.url || item?.url)
            .filter(Boolean);

        // Merge and de-duplicate
        const links = Array.from(new Set([...responseLinks, ...sourceLinks]));

        // Send response with sources and links
        res.json({
            success: true,
            response, // cleaned response without URLs
            links,    // all URLs here
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

export default hushhRouter;