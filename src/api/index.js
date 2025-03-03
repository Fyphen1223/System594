const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const { Client } = require('@elastic/elasticsearch');
const config = require('./config.json');

const indiceName = 'debate2025';

// Create Express application
const app = express();
const PORT = process.env.PORT || 3000;

const client = new Client({
	node: 'https://localhost:9200',
	auth: {
		username: 'elastic',
		password: config.password,
	},
	tls: {
		rejectUnauthorized: false,
	},
	ssl: {
		rejectUnauthorized: false,
	},
});

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

function isValidDocument(document) {
	return (
		document &&
		document.title &&
		document.author &&
		document.body &&
		document.link &&
		document.tags
	);
}

// バージョン情報確認関数
const checkElasticsearchInfo = async () => {
	try {
		const info = await client.info();
		console.log('Elasticsearch version:', info.version);
		console.log('Cluster name:', info.cluster_name);
	} catch (error) {
		console.error('Error getting Elasticsearch info:', error);
		if (error.meta && error.meta.body) {
			console.error('Error details:', error.meta.body);
		}
	}
};

// Check if index exists and create if it doesn't
const initializeElasticsearch = async () => {
	const maxRetries = 5;
	const retryDelay = 5000; // 5 seconds

	for (let i = 0; i < maxRetries; i++) {
		try {
			await checkElasticsearchInfo();
			const ping = await client.ping();
			if (ping) {
				console.log('Successfully connected to Elasticsearch');

				const indexExists = await client.indices.exists({ index: indiceName });
				if (!indexExists) {
					await client.indices.create({
						index: indiceName,
						body: {
							mappings: {
								properties: {
									title: { type: 'text' },
									author: { type: 'keyword' },
									year: { type: 'keyword' },
									body: { type: 'text' },
									link: { type: 'keyword' },
									tags: { type: 'text' },
									timestamp: { type: 'date' },
									id: { type: 'keyword' },
								},
							},
							settings: {
								analysis: {
									analyzer: {
										default: {
											type: 'standard',
										},
									},
									highlight: {
										type: 'unified',
										boundary_scanner: 'sentence',
									},
								},
							},
						},
					});
					console.log('Created "debate2025" index');
				} else {
					console.log('"debate2025" index already exists');
				}
				return;
			}
		} catch (error) {
			console.error(`Attempt ${i + 1}/${maxRetries} failed:`, error.message);
			if (i < maxRetries - 1) {
				console.log(`Retrying in ${retryDelay / 1000} seconds...`);
				await new Promise((resolve) => setTimeout(resolve, retryDelay));
			}
		}
	}
	console.error('Failed to connect to Elasticsearch after multiple attempts');
};

// Initialize Elasticsearch when server starts
initializeElasticsearch();

// Serve static files from the dist directory
app.use(express.static(path.join(__dirname, 'dist')));

// Serve edit.html for any /edit route
app.get(['/edit', '/edit.html'], (req, res) => {
	res.sendFile(path.join(__dirname, 'dist/html/edit.html'));
});

// Serve index.html for the root route
app.get('/', (req, res) => {
	res.sendFile(path.join(__dirname, 'dist/html/index.html'));
});

// Document creation endpoint
app.post('/api/create', async (req, res) => {
	try {
		if (req.body && isValidDocument(req.body)) {
			// Find the latest Document
			const result = await createDocument(req);

			console.log('Document registered with ID:', result._id);

			res.json({
				message: 'Document created successfully',
				code: 200,
				id: result._id,
			});
		} else {
			res.status(400).json({ message: 'Invalid document', code: 400 });
		}
	} catch (error) {
		console.error('Elasticsearch error:', error);
		res.status(500).json({
			message: 'Error creating document',
			code: 500,
		});
	}
});

// Get individual document
app.get('/api/document/:id', async (req, res) => {
	try {
		const { id } = req.params;
		const result = await client.search({
			index: indiceName,
			body: {
				query: {
					term: {
						id: {
							value: id,
						},
					},
				},
			},
		});

		if (result.hits.hits.length === 0) {
			return res.status(404).json({
				message: 'Document not found',
				code: 404,
			});
		}

		res.json(result.hits.hits[0]);
	} catch (error) {
		console.error('Error fetching document:', error);
		res.status(500).json({
			message: 'Error fetching document',
			code: 500,
		});
	}
});

// Update individual document
app.put('/api/document/:id', async (req, res) => {
	try {
		const { id } = req.params;
		if (!isValidDocument(req.body)) {
			return res.status(400).json({
				message: 'Invalid document data',
				code: 400,
			});
		}

		const result = await client.updateByQuery({
			index: indiceName,
			body: {
				query: {
					term: {
						id: {
							value: id,
						},
					},
				},
				script: {
					source: `
                        ctx._source.title = params.title;
                        ctx._source.author = params.author;
                        ctx._source.year = params.year;
                        ctx._source.body = params.body;
                        ctx._source.link = params.link;
                        ctx._source.tags = params.tags;
                    `,
					params: req.body,
				},
			},
			refresh: true,
		});

		if (result.updated === 0) {
			return res.status(404).json({
				message: 'Document not found',
				code: 404,
			});
		}

		res.json({
			message: 'Document updated successfully',
			code: 200,
		});
	} catch (error) {
		console.error('Error updating document:', error);
		res.status(500).json({
			message: 'Error updating document',
			code: 500,
		});
	}
});

// Delete individual document
app.delete('/api/document/:id', async (req, res) => {
	try {
		const { id } = req.params;
		const result = await client.deleteByQuery({
			index: indiceName,
			body: {
				query: {
					term: {
						id: {
							value: id,
						},
					},
				},
			},
			refresh: true,
		});

		if (result.deleted === 0) {
			return res.status(404).json({
				message: 'Document not found',
				code: 404,
			});
		}

		res.json({
			message: 'Document deleted successfully',
			code: 200,
		});
	} catch (error) {
		console.error('Error deleting document:', error);
		res.status(500).json({
			message: 'Error deleting document',
			code: 500,
		});
	}
});

// Search endpoints
app.post('/api/search/:type', async (req, res) => {
	const { type } = req.params;
	const searchFunctions = {
		title: searchDocumentWithTitle,
		author: searchDocumentWithAuthor,
		body: searchDocumentWithBody,
		tags: searchDocumentWithTags,
	};

	try {
		if (!searchFunctions[type]) {
			return res.status(400).json({
				message: 'Invalid search type',
				code: 400,
			});
		}

		const result = await searchFunctions[type](req);
		res.json(result);
	} catch (error) {
		console.error('Search error:', error);
		res.status(500).json({
			message: 'Error performing search',
			code: 500,
		});
	}
});

async function createDocument(req) {
	const latestResult = await client.search({
		index: indiceName,
		body: {
			sort: [{ timestamp: { order: 'desc' } }],
			size: 1,
		},
	});
	let latestId = 0;
	if (latestResult.hits.hits.length > 0) {
		const currentId = parseInt(latestResult.hits.hits[0]._source.id || '0', 10);
		if (!isNaN(currentId)) {
			latestId = currentId;
		}
	}
	const newId = (latestId + 1).toString();
	const indexOptions = {
		index: indiceName,
		document: {
			title: req.body.title,
			author: req.body.author,
			year: req.body.year,
			body: req.body.body,
			link: req.body.link,
			tags: req.body.tags,
			id: newId,
			timestamp: new Date(),
		},
	};
	const result = await client.index(indexOptions);
	return result;
}

async function searchDocumentWithTitle(req) {
	const result = await client.search({
		index: indiceName,
		body: {
			query: {
				match: {
					title: {
						query: req.body.title,
						operator: 'or',
						fuzziness: 'AUTO',
					},
				},
			},
			highlight: {
				fields: {
					title: {
						pre_tags: ['<span class="highlight">'],
						post_tags: ['</span>'],
						number_of_fragments: 0,
					},
					body: {
						pre_tags: ['<span class="highlight">'],
						post_tags: ['</span>'],
						fragment_size: 200,
						number_of_fragments: 1,
					},
				},
			},
			sort: [{ timestamp: { order: 'desc' } }],
		},
	});
	return result;
}

async function searchDocumentWithAuthor(req) {
	const result = await client.search({
		index: indiceName,
		body: {
			query: {
				match: {
					author: {
						query: req.body.author,
						operator: 'or',
					},
				},
			},
			highlight: {
				fields: {
					author: {
						pre_tags: ['<span class="highlight">'],
						post_tags: ['</span>'],
						number_of_fragments: 0,
					},
					body: {
						pre_tags: ['<span class="highlight">'],
						post_tags: ['</span>'],
						fragment_size: 200,
						number_of_fragments: 1,
					},
				},
			},
			sort: [{ timestamp: { order: 'desc' } }],
		},
	});
	return result;
}

async function searchDocumentWithBody(req) {
	const result = await client.search({
		index: indiceName,
		body: {
			query: {
				match: {
					body: {
						query: req.body.body,
						operator: 'or',
						fuzziness: 'AUTO',
					},
				},
			},
			highlight: {
				fields: {
					body: {
						pre_tags: ['<span class="highlight">'],
						post_tags: ['</span>'],
						fragment_size: 200,
						number_of_fragments: 1,
					},
					title: {
						pre_tags: ['<span class="highlight">'],
						post_tags: ['</span>'],
						number_of_fragments: 0,
					},
				},
			},
			sort: [{ timestamp: { order: 'desc' } }],
		},
	});
	return result;
}

async function searchDocumentWithTags(req) {
	const result = await client.search({
		index: indiceName,
		body: {
			query: {
				match: {
					tags: {
						query: req.body.tags,
						operator: 'or',
					},
				},
			},
			highlight: {
				fields: {
					tags: {
						pre_tags: ['<span class="highlight">'],
						post_tags: ['</span>'],
						number_of_fragments: 0,
					},
					title: {
						pre_tags: ['<span class="highlight">'],
						post_tags: ['</span>'],
						number_of_fragments: 0,
					},
					body: {
						pre_tags: ['<span class="highlight">'],
						post_tags: ['</span>'],
						fragment_size: 200,
						number_of_fragments: 1,
					},
				},
			},
			sort: [{ timestamp: { order: 'desc' } }],
		},
	});
	return result;
}

app.listen(PORT, () => {
	console.log(`Server running on port ${PORT}`);
});

module.exports = app;
