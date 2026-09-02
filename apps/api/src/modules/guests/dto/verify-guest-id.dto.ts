import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

// All optional — a guest who already has a document on file (see
// GuestsService.verifyId) can be verified with no body at all. These are
// only required together when there's nothing on file yet and the caller is
// capturing it for the first time in the same action.
export class VerifyGuestIdDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  idDocumentType?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  idDocumentNumber?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  idDocumentUrl?: string;
}
