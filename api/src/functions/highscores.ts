import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { TableClient } from '@azure/data-tables';
import { DefaultAzureCredential } from '@azure/identity';
import { randomUUID } from 'node:crypto';

const tableName = process.env.HIGH_SCORES_TABLE_NAME ?? 'FlappyMuisHighScores';
const accountName = process.env.HIGH_SCORES_STORAGE_ACCOUNT;
const allowedOrigin = process.env.HIGH_SCORES_ALLOWED_ORIGIN;
const maximumScore = 9_999;

interface HighScoreEntity {
    partitionKey: string;
    rowKey: string;
    name: string;
    score: number;
    playedAt: string;
}

function getTableClient(): TableClient {
    if (!accountName) {
        throw new Error('HIGH_SCORES_STORAGE_ACCOUNT is not configured.');
    }
    return new TableClient(
        `https://${accountName}.table.core.windows.net`,
        tableName,
        new DefaultAzureCredential(),
    );
}

function corsHeaders(request: HttpRequest): Record<string, string> {
    const origin = request.headers.get('origin');
    if (!allowedOrigin || !origin || origin !== allowedOrigin) return {};
    return {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Vary': 'Origin',
    };
}

function json(status: number, body: unknown, headers: Record<string, string>): HttpResponseInit {
    return { status, jsonBody: body, headers };
}

export async function highscores(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const headers = corsHeaders(request);
    if (request.method === 'OPTIONS') return { status: 204, headers };

    try {
        const table = getTableClient();
        if (request.method === 'GET') {
            const scores: Array<{ name: string; score: number; playedAt: string }> = [];
            for await (const entity of table.listEntities<HighScoreEntity>({
                queryOptions: { filter: `PartitionKey eq 'flappy-muis'` },
            })) {
                scores.push({ name: entity.name, score: entity.score, playedAt: entity.playedAt });
            }
            scores.sort((left, right) => right.score - left.score || left.playedAt.localeCompare(right.playedAt));
            return json(200, scores.slice(0, 10), headers);
        }

        const body = await request.json() as { name?: unknown; score?: unknown };
        const name = typeof body.name === 'string' ? body.name.trim().slice(0, 24) : '';
        const score = typeof body.score === 'number' ? body.score : Number.NaN;
        if (!name || !Number.isInteger(score) || score < 0 || score > maximumScore) {
            return json(400, { error: 'Naam en een geldige score zijn verplicht.' }, headers);
        }

        const playedAt = new Date().toISOString();
        await table.createEntity<HighScoreEntity>({
            partitionKey: 'flappy-muis',
            rowKey: `${String(maximumScore - score).padStart(5, '0')}-${Date.now()}-${randomUUID()}`,
            name,
            score,
            playedAt,
        });
        return json(201, { name, score, playedAt }, headers);
    } catch (error) {
        context.error('High-score request failed.', error);
        return json(500, { error: 'De highscoreservice is tijdelijk niet beschikbaar.' }, headers);
    }
}

app.http('highscores', {
    methods: ['GET', 'POST', 'OPTIONS'],
    authLevel: 'anonymous',
    route: 'highscores',
    handler: highscores,
});
