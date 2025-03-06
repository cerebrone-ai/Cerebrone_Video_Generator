import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  // Simply return the next response without any authentication checks
  return NextResponse.next({ request });
}
