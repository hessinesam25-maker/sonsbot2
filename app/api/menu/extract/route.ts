import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/db/supabase-ssr';
import { getBackendSupabaseClient } from '@/lib/db/client';
import { db } from '@/lib/db/store';
import { parseCsvMenu, parseTextMenu, detectDuplicates, ParsedMenuItem } from '@/lib/menu/parser';
import Tesseract from 'tesseract.js';

export const dynamic = 'force-dynamic';

async function authenticateAndAuthorize(req: NextRequest, targetTenantId?: string) {
  const backend = getBackendSupabaseClient();
  const ssrClient = createServerSupabaseClient(req);

  let isPlatformAdmin = false;
  let tenantUser: { tenant_id: string; role: string } | null = null;
  let isAuthenticated = false;

  const { data: { user }, error: authErr } = await ssrClient.auth.getUser();

  if (user && !authErr) {
    isAuthenticated = true;
    const { data: adminCheck } = await backend
      .from('platform_admins')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (adminCheck) {
      isPlatformAdmin = true;
    } else {
      const { data: userCheck } = await backend
        .from('users')
        .select('tenant_id, role')
        .eq('auth_user_id', user.id)
        .maybeSingle();

      if (userCheck) {
        tenantUser = userCheck;
      }
    }
  } else if (process.env.NODE_ENV === 'test') {
    const testRole = req.headers.get('x-test-role');
    const testTenantId = req.headers.get('x-test-tenant-id');
    const authHeader = req.headers.get('Authorization');

    if (authHeader && authHeader.startsWith('Bearer test_')) {
      isAuthenticated = true;
      if (testRole === 'platform_admin') {
        isPlatformAdmin = true;
      } else if (testTenantId) {
        tenantUser = {
          tenant_id: testTenantId,
          role: testRole || 'owner',
        };
      }
    }
  }

  if (!isAuthenticated) {
    return { status: 401, error: 'Unauthorized: Valid authentication required.' };
  }

  if (isPlatformAdmin) {
    return { isPlatformAdmin: true, tenantId: targetTenantId || tenantUser?.tenant_id };
  }

  if (!tenantUser) {
    return { status: 403, error: 'Forbidden: No tenant user mapping found.' };
  }

  if (targetTenantId && targetTenantId !== tenantUser.tenant_id) {
    return { status: 403, error: 'Forbidden: Cross-tenant access denied.' };
  }

  return { isPlatformAdmin: false, tenantId: tenantUser.tenant_id, role: tenantUser.role };
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const requestedTenantId = (formData.get('tenantId') || formData.get('tenant_id')) as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No menu file uploaded.' }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size exceeds maximum 10MB limit.' }, { status: 400 });
    }

    const authResult = await authenticateAndAuthorize(req, requestedTenantId || undefined);
    if (authResult.status && authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const targetTenantId = authResult.isPlatformAdmin ? (requestedTenantId || authResult.tenantId) : authResult.tenantId;

    if (!targetTenantId) {
      return NextResponse.json({ error: 'tenantId is required.' }, { status: 400 });
    }

    const fileName = file.name.toLowerCase();
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let rawExtractedText = '';
    let extractedItems: ParsedMenuItem[] = [];

    if (fileName.endsWith('.csv') || file.type === 'text/csv') {
      const csvText = buffer.toString('utf-8');
      extractedItems = parseCsvMenu(csvText);
    } else if (fileName.endsWith('.pdf') || file.type === 'application/pdf') {
      try {
        const { PDFParse } = require('pdf-parse');
        const uint8Array = new Uint8Array(buffer);
        const pdfInstance = new PDFParse(uint8Array);
        await pdfInstance.load();
        const pdfResult = await pdfInstance.getText();
        rawExtractedText = typeof pdfResult === 'string' ? pdfResult : (pdfResult?.text || '');
        extractedItems = parseTextMenu(rawExtractedText);

        if (extractedItems.length === 0 && (!rawExtractedText || rawExtractedText.trim().length < 20)) {
          return NextResponse.json({
            error: 'Scanned image PDF detected without selectable text. Please upload menu as JPG/PNG image directly for OCR processing.',
          }, { status: 422 });
        }
      } catch (pdfErr: any) {
        console.error('[PDF_EXTRACTION_ERROR]', pdfErr);
        return NextResponse.json({ error: `Failed to extract text from PDF file: ${pdfErr.message}` }, { status: 422 });
      }
    } else if (
      fileName.endsWith('.jpg') ||
      fileName.endsWith('.jpeg') ||
      fileName.endsWith('.png') ||
      file.type.startsWith('image/')
    ) {
      try {
        let workerResult;
        try {
          // Multilingual OCR attempt for English, Dutch, French, Arabic
          workerResult = await Tesseract.recognize(buffer, 'eng+nld+fra+ara');
        } catch (langErr) {
          // Fallback to standard English OCR if language data bundle is unavailable
          workerResult = await Tesseract.recognize(buffer, 'eng');
        }
        rawExtractedText = workerResult?.data?.text || '';
        extractedItems = parseTextMenu(rawExtractedText);
      } catch (ocrErr: any) {
        console.error('[IMAGE_OCR_ERROR]', ocrErr);
        return NextResponse.json({ error: 'Failed to execute OCR on image file.' }, { status: 422 });
      }
    } else {
      return NextResponse.json({ error: 'Unsupported file type. Please upload a .csv, .pdf, .jpg, or .png file.' }, { status: 400 });
    }

    if (extractedItems.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No valid menu items could be recognized from file.',
        rawTextPreview: rawExtractedText ? rawExtractedText.slice(0, 300) : null,
      }, { status: 422 });
    }

    const existingMenu = await db.getMenu(targetTenantId);
    const withDuplicates = detectDuplicates(extractedItems, existingMenu);

    return NextResponse.json({
      success: true,
      fileName: file.name,
      mimeType: file.type,
      count: withDuplicates.length,
      items: withDuplicates,
      rawTextLength: rawExtractedText.length,
    });
  } catch (error: any) {
    console.error('Error in menu extract API endpoint:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Internal server error during menu file extraction.',
    }, { status: 500 });
  }
}
