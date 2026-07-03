import { Module } from '@nestjs/common';
import { XmlParserService } from './xml-parser.service.js';

@Module({
  providers: [XmlParserService],
  exports: [XmlParserService],
})
export class XmlModule {}
