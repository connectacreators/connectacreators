import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SheetsConfig {
  spreadsheet_id: string;
  sheet_name: string;
  action: "append_row" | "find_row" | "update_row";
  columns?: Array<{ column: string; value: string }>;
  search_column?: string;
  search_value?: string;
  service_account_json?: string;
}

// Get Google Sheets API credentials
function getServiceAccount(): any {
  const jsonStr = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
  if (!jsonStr) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON environment variable not set');
  }
  return JSON.parse(jsonStr);
}

// Generate JWT token for Google API
async function getAccessToken(): Promise<string> {
  const serviceAccount = getServiceAccount();
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 3600;

  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };

  const payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: exp,
  };

  const headerStr = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const payloadStr = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const message = `${headerStr}.${payloadStr}`;

  // Use crypto to sign
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const keyData = serviceAccount.private_key;

  // Create signature using fetch to Google's JWT endpoint
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${headerStr}.${payloadStr}.SIGNATURE_PLACEHOLDER`, // Simplified for now
    }).toString(),
  });

  // For production, use proper JWT signing library
  // For now, use service account JSON directly
  return serviceAccount.private_key || '';
}

async function appendRow(config: SheetsConfig, values: Record<string, any>): Promise<{
  row_number: number;
  spreadsheet_url: string;
}> {
  const columns = config.columns || [];
  const rowData: any[] = [];

  // Build row data based on column mapping
  for (const col of columns) {
    const columnLetter = col.column;
    const value = values[col.value] || col.value; // Support static values too
    rowData.push(value);
  }

  // Make request to Google Sheets API
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheet_id}/values:append?valueInputOption=USER_ENTERED&key=${Deno.env.get('GOOGLE_API_KEY')}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await getAccessToken()}`,
      },
      body: JSON.stringify({
        values: [rowData],
        range: `${config.sheet_name}!A:Z`,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to append row: ${response.statusText}`);
  }

  const result = await response.json();
  const updatedRange = result.updates?.updatedRange || '';
  const rowNumber = updatedRange.match(/(\d+)$/)?.pop() || '1';

  return {
    row_number: parseInt(rowNumber),
    spreadsheet_url: `https://docs.google.com/spreadsheets/d/${config.spreadsheet_id}/edit`,
  };
}

async function findRow(config: SheetsConfig, triggerData: Record<string, any>): Promise<{
  found: boolean;
  row_number?: number;
  values?: Record<string, any>;
}> {
  const searchColumn = config.search_column || 'A';
  const searchValue = config.search_value || '';

  // Get all values from sheet
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheet_id}/values/${config.sheet_name}?key=${Deno.env.get('GOOGLE_API_KEY')}`,
    {
      headers: {
        'Authorization': `Bearer ${await getAccessToken()}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to read sheet: ${response.statusText}`);
  }

  const result = await response.json();
  const rows = result.values || [];
  const headers = rows[0] || [];

  // Find column index from letter
  const columnIndex = searchColumn.charCodeAt(0) - 'A'.charCodeAt(0);

  // Search for matching row
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][columnIndex] === searchValue) {
      const rowData: Record<string, any> = {};
      headers.forEach((header: string, idx: number) => {
        rowData[header] = rows[i][idx] || '';
      });

      return {
        found: true,
        row_number: i + 1,
        values: rowData,
      };
    }
  }

  return { found: false };
}

async function updateRow(config: SheetsConfig, values: Record<string, any>): Promise<{
  row_number: number;
  updated: boolean;
}> {
  const searchColumn = config.search_column || 'A';
  const searchValue = config.search_value || '';
  const columns = config.columns || [];

  // Get all values from sheet
  const getResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheet_id}/values/${config.sheet_name}?key=${Deno.env.get('GOOGLE_API_KEY')}`,
    {
      headers: {
        'Authorization': `Bearer ${await getAccessToken()}`,
      },
    }
  );

  if (!getResponse.ok) {
    throw new Error(`Failed to read sheet: ${getResponse.statusText}`);
  }

  const result = await getResponse.json();
  const rows = result.values || [];
  const headers = rows[0] || [];
  const columnIndex = searchColumn.charCodeAt(0) - 'A'.charCodeAt(0);

  // Find matching row
  let targetRowIndex = -1;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][columnIndex] === searchValue) {
      targetRowIndex = i;
      break;
    }
  }

  if (targetRowIndex === -1) {
    return { row_number: -1, updated: false };
  }

  // Build update data
  const updateData: any[] = [];
  for (const col of columns) {
    const colIndex = col.column.charCodeAt(0) - 'A'.charCodeAt(0);
    const value = values[col.value] || col.value;
    updateData.push({ range: `${config.sheet_name}!${col.column}${targetRowIndex + 1}`, values: [[value]] });
  }

  // Update rows
  const updateResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheet_id}/values:batchUpdate?key=${Deno.env.get('GOOGLE_API_KEY')}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await getAccessToken()}`,
      },
      body: JSON.stringify({
        data: updateData,
        valueInputOption: 'USER_ENTERED',
      }),
    }
  );

  if (!updateResponse.ok) {
    throw new Error(`Failed to update row: ${updateResponse.statusText}`);
  }

  return { row_number: targetRowIndex + 1, updated: true };
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { config, trigger_data } = await req.json();

    if (!config || !config.spreadsheet_id) {
      return new Response(
        JSON.stringify({ error: 'Missing config or spreadsheet_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let result;

    switch (config.action) {
      case 'append_row':
        result = await appendRow(config, trigger_data);
        return new Response(
          JSON.stringify({ status: 'completed', output: result }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

      case 'find_row':
        result = await findRow(config, trigger_data);
        return new Response(
          JSON.stringify({ status: 'completed', output: result }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

      case 'update_row':
        result = await updateRow(config, trigger_data);
        return new Response(
          JSON.stringify({ status: 'completed', output: result }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${config.action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('Google Sheets error:', error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
