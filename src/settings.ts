/*
 *  Power BI Visualizations
 *
 *  Copyright (c) Akvelon
 *  All rights reserved.
 *  MIT License
 *
 *  Permission is hereby granted, free of charge, to any person obtaining a copy
 *  of this software and associated documentation files (the ""Software""), to deal
 *  in the Software without restriction, including without limitation the rights
 *  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *  copies of the Software, and to permit persons to whom the Software is
 *  furnished to do so, subject to the following conditions:
 *
 *  The above copyright notice and this permission notice shall be included in
 *  all copies or substantial portions of the Software.
 *
 *  THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 *  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 *  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 *  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 *  THE SOFTWARE.
 */

module powerbi.extensibility.visual {
    import DataViewObjectsParser = utils.dataview.DataViewObjectsParser;

    export class ChartSettings extends DataViewObjectsParser {
        linesSettings: LinesSettings = new LinesSettings();
        columnsSettings: ColumnsSettings = new ColumnsSettings();
        regionsSettings: RegionsSettings = new RegionsSettings();
        axisesSettings: AxisesSettings = new AxisesSettings();
        tooltipsSettings: TooltipsSettings = new TooltipsSettings();
    }

    export class LinesSettings {
        linesWidth: number = 4;
    }

    export class ColumnsSettings {
        columnsWidth: number = 90;
        columnsColor: string = "red";
    }

    export class AxisesSettings {
        LeftYAxisMaxValue: number = null;
        LeftYAxisMinValue: number = null;
        RightYAxisMaxValue: number = null;
        RightYAxisMinValue: number = null;
        LeftYAxisLabelDisplayUnits: number = 0;
        LeftYAxisLabelPrecision: number = 0;
        RightYAxisLabelDisplayUnits: number = 0;
        RightYAxisLabelPrecision: number = 0;
    }
    
    export class RegionsSettings {
        region1Color: string = "#00B050";
        region2Color: string = "#C6E0B4";
        region3Color: string = "#FFFFFF";
        region4Color: string = "#FFC000";
        region5Color: string = "#FF0000";
        region1ValuesMin: number = 0;
        region1ValuesMax: number = 20;
        region2ValuesMin: number = 20;
        region2ValuesMax: number = 40;
        region3ValuesMin: number = 40;
        region3ValuesMax: number = 60;
        region4ValuesMin: number = 60;
        region4ValuesMax: number = 80;
        region5ValuesMin: number = 80;
        region5ValuesMax: number = 100;
    }
    export class TooltipsSettings {
        tooltipValue: Array<any> = [];
    }
}