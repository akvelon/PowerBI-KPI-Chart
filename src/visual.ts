/*
 *  Power BI Visual CLI
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
    import ColorHelper = powerbi.extensibility.utils.color.ColorHelper;
    import IInteractivityService = powerbi.extensibility.utils.interactivity.IInteractivityService;
    import createInteractivityService = powerbi.extensibility.utils.interactivity.createInteractivityService;

    import ISelectionId = powerbi.visuals.ISelectionId;
    import DataViewObjects = powerbi.DataViewObjects;
    import DataViewCategoryColumn = powerbi.DataViewCategoryColumn;

    import valueFormatter = powerbi.extensibility.utils.formatting.valueFormatter;
    import ValueFormatter = powerbi.extensibility.utils.formatting.valueFormatter;
    import IValueFormatter = powerbi.extensibility.utils.formatting.IValueFormatter;

    let chartOptions = {
        margin: { left: 40, right: 40, bottom:50, top: 50 },
        regionsOptions: {
            gapColor: "#FFFFFF"
        },
        lineType: {
            solid: "solid",
            dotted: "dotted",
            dashed: "dashed",
            dashDot: "dash-dot"
        }
    }

    const ChangeDataType: number = 2;
    const ChangeAllType: number = 62;

    interface IValue {
        x: number,
        y: number,
        categoryIndex?: number;
    }

    interface ILine {
        values: IValue[];
        color?: string;
        key: string;
        strokeWidth?: number;
        type?: string;
        identity: ISelectionId;
    }

    class MultiChartElement {
        public type: string;
        public yAxis: number;
        constructor(public color: string = null, public key: string = null, public values: any[] = []) {
        }
    }

    class Region extends MultiChartElement {
        public index: number;
        constructor(public color: string = null, public key: string = null, public values: any[] = []) {
            super(color, key, values);
            this.type = "area";
            this.yAxis = 1;
        }
    }

    class RegionData {
        constructor(public minValues: PrimitiveValue[], public maxValues: PrimitiveValue[], public regionIndex: number) {
        }
    }

    class Column extends MultiChartElement {
        constructor(public color: string = null, public key: string = null, public values: any[] = []) {
            super(color, key, values);
            this.type = "bar";
            this.yAxis = 2;
        }
    }

    export class Visual implements IVisual {
        private viewport: powerbi.IViewport;
        private host: IVisualHost;
        private tooltipServiceWrapper: ITooltipServiceWrapper;
        private interactivityService: IInteractivityService;

        private lines: ILine[] = [];
        private multiChartElements: MultiChartElement[] = [];

        private svg: d3.Selection<{}>;
        private nvd3: nv.Nvd3Static;
        private xAxisTicks: number[];
        private dateFormat: string;
        private linesColor: string[] = [];
        private settings: ChartSettings;
        private colors: IColorPalette;
        private valueFormatter: IValueFormatter;

        private currentOptions: VisualUpdateOptions;

        private constants: any = {
            tickSize: 10
        }

        constructor(options: VisualConstructorOptions) {
            this.host = options.host;
            this.tooltipServiceWrapper = createTooltipServiceWrapper(options.host.tooltipService, options.element);
            this.interactivityService = createInteractivityService(this.host);
            this.colors = options.host.colorPalette;

            this.nvd3 = <nv.Nvd3Static>(<any>window).nv;
            this.svg = d3.select(options.element).append('svg').attr('class', 'svg');
        }

        public update(options: VisualUpdateOptions) {
            this.clear();
            if (!this.optionsIsCorrect(options)) {
                return;
            }

            this.viewport = {
                width: Math.max(0, options.viewport.width),
                height: Math.max(0, options.viewport.height)
            };

            this.settings = this.parseSettings(options.dataViews[0]);

            if (options.type === ChangeDataType || options.type === ChangeAllType) {
                if (!this.currentOptions || this.dataChanged(this.currentOptions.dataViews[0].categorical, options.dataViews[0].categorical)) {
                    this.getMultichartData(options);
                    this.currentOptions = options;
                }
            }

            this.getLineChartData(options);

            this.updateFormatting(options);

            this.render(options);

            this.addTooltips(options);
        }

        public addTooltips(options: VisualUpdateOptions) {
            this.tooltipServiceWrapper.addTooltip(this.svg.selectAll("rect"), 
                (tooltipEvent: TooltipEventArgs<number>) =>{return Visual.getBarChartTooltipData(options, tooltipEvent)},
                (tooltipEvent: TooltipEventArgs<number>) => null);

            this.tooltipServiceWrapper.addTooltip(this.svg.selectAll(".nv-point"), 
                (tooltipEvent: TooltipEventArgs<number>) =>{return Visual.getLineChartTooltipData(options, tooltipEvent)},
                (tooltipEvent: TooltipEventArgs<number>) => null);
        }

        private static getLineChartTooltipData(options:any, value: any): VisualTooltipDataItem[] {
            let tooltipInfo = []; 
            let dateFormat = options.dataViews[0].categorical.categories[0].source 
                ? options.dataViews[0].categorical.categories[0].source.format? options.dataViews[0].categorical.categories[0].source.format : 'MM/DD/YYYY'
                :'MM/DD/YYYY';
            let formatter = valueFormatter.create({format:dateFormat});
            let currentDate = value.data['categoryIndex'] !== undefined ? options.dataViews[0].categorical.categories[0].values[value.data['categoryIndex']] : options.dataViews[0].categorical.categories[0].values[value.data[0]['categoryIndex']];
            let tooltipValues = options.dataViews[0].categorical.values.filter(function (v: any) { return v.source.roles["lineValues"]});
            let formatterNumber = valueFormatter.create({format:""});
            tooltipInfo.push({
                displayName: options.dataViews[0].categorical.categories[0].source ? options.dataViews[0].categorical.categories[0].source.displayName : null,
                value: formatter.format(currentDate),
                color: null
            },
            {
                displayName: tooltipValues[0] ? tooltipValues[0].source.displayName : null,
                value: formatterNumber.format(value.data[0].y),
                color: null
            }
        );
            return tooltipInfo;
        }


        private static getBarChartTooltipData(options: any, value: any): VisualTooltipDataItem[] {
            let tooltipInfo = []; 
            let dateFormat = options.dataViews[0].categorical.categories[0].source.format? options.dataViews[0].categorical.categories[0].source.format : 'MM/DD/YYYY';
            let formatter = valueFormatter.create({format:dateFormat});
            let formatterNumber = valueFormatter.create({format:""});
            let currentDate = value.data['categoryIndex'] !== undefined ? options.dataViews[0].categorical.categories[0].values[value.data['categoryIndex']] : options.dataViews[0].categorical.categories[0].values[value.data[0]['categoryIndex']];
            let tooltipValues = options.dataViews[0].categorical.values.filter(function (v: any) { return v.source.roles["tooltipValue"]&&!v.source.roles["columnValues"]});
            let tooltipColumnValues = options.dataViews[0].categorical.values.filter(function (v: any) { return v.source.roles["columnValues"]});
            let tooltipUniqExtraValues = [];
            let uniqueElements = {};
            tooltipValues.forEach(element => {
                if (!uniqueElements[element.source.displayName]) {
                    tooltipUniqExtraValues.push(element);
                    uniqueElements[element.source.displayName] = element;
                }
            })
            tooltipInfo.push({
                displayName: options.dataViews[0].categorical.categories[0].source.displayName,
                value: formatter.format(currentDate),
                color: null
            },
            {
                displayName: tooltipColumnValues[0].source.displayName,
                value: formatterNumber.format(value.data.y),
                color: null
            });

            tooltipUniqExtraValues.forEach(element =>
                {
                    let currentValue = value.data['categoryIndex'] !== undefined ? element.values[value.data['categoryIndex']] : element.values[value.data[0]['categoryIndex']];
                    if(currentValue){
                        tooltipInfo.push({
                        displayName: element.source.displayName,
                        value: currentValue instanceof Date ? formatter.format(currentValue) : currentValue.toString(),
                        color: null
                    });
                   }
                });
            return tooltipInfo;
        }

        private updateFormatting(options: VisualUpdateOptions) {
            this.setStylesOfColumns();
            this.setStylesOfRegions();
            this.getRegionsData(options);
        }

        private setStylesOfColumns() {
            this.multiChartElements.filter(element => element.type === "bar").forEach((column) => {
                column.color = this.settings.columnsSettings.columnsColor;
            })
        }

        private setStylesOfRegions() {
            this.multiChartElements.filter(element => element.type === "area" && (element as Region).index)
                .forEach((region) => {
                    let colorKey = `region${(region as Region).index}Color`;
                    region.color = this.settings.regionsSettings[colorKey];
                });
        }

        private dataChanged(oldData: DataViewCategorical, newData: DataViewCategorical): boolean {
            var valuesCountIsEqual = newData.values.length == oldData.values.length;
            if (!valuesCountIsEqual) {
                return true;
            }

            var categoriesIsEqual = _.isEqual(oldData.categories, newData.categories);
            if (!categoriesIsEqual) {
                return true;
            }

            for (var i = 0; i < newData.values.length; i++) {
                var valuesIsEqual = _.isEqual(newData.values[i], oldData.values[i]);
                if (!valuesIsEqual) {
                    return true;
                }
            }

            return false;
        }

        private parseSettings(dataView: DataView): ChartSettings {
            let settings = ChartSettings.parse<ChartSettings>(dataView);

            let groups = dataView.categorical.values.grouped();

            let min = groups[0].values[0].values[0] as number;
            let max = min;
            groups.forEach(group => {
                group.values.forEach(value => {
                    max = Math.max(max, d3.max(value.values.map(v => v as number)));
                    min = Math.min(min, d3.min(value.values.map(v => v as number)));
                });
            });

            if (settings.axisesSettings.LeftYAxisMinValue === null) {
                settings.axisesSettings.LeftYAxisMinValue = min;
            }

            if (settings.axisesSettings.LeftYAxisMaxValue === null) {
                settings.axisesSettings.LeftYAxisMaxValue = max;
            }

            let categories = dataView.categorical.categories[0].values;

            let categorySum = {};
            dataView.categorical.values.forEach( (value, valueIndex) => {
                categories.forEach( (category, categoryIndex) => {
                    if (!value.source.roles.columnValues) {
                        return;
                    }
                    
                    if (!categorySum[categoryIndex]) {
                        categorySum[categoryIndex] = 0;
                    }
                    
                    categorySum[categoryIndex] += value.values[categoryIndex];
                });
            });
            
            for (let field in categorySum) {
                max = categorySum[0];
                min = categorySum[0];
                for (let value in categorySum) {
                    if (categorySum[value] > max) {
                        max = categorySum[value]
                    }
                    if (categorySum[value] < min) {
                        min = categorySum[value]
                    }
                }

                max = max;
                min = min;
            }

            if (settings.axisesSettings.RightYAxisMinValue === null) {
                settings.axisesSettings.RightYAxisMinValue = min;
            }

            if (settings.axisesSettings.RightYAxisMaxValue === null) {
                settings.axisesSettings.RightYAxisMaxValue = max;
            }

            return settings;
        }

        public enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions): VisualObjectInstanceEnumeration {

            const settings: ChartSettings = this.settings
                || ChartSettings.getDefault() as ChartSettings;

            const instanceEnumeration: VisualObjectInstanceEnumeration =
                ChartSettings.enumerateObjectInstances(settings, options);

            let objectName = options.objectName;
            switch (objectName) {
                case 'linesSettings':
                    {
                        const lines: ILine[] = this.lines;

                        if (!lines || !(lines.length > 0)) {
                            return;
                        }

                        lines.forEach((line: ILine) => {
                            const selectionId: ISelectionId = line.identity as ISelectionId;
                            const selector = ColorHelper.normalizeSelector(selectionId.getSelector(), false);

                            this.addAnInstanceToEnumeration(instanceEnumeration, {          
                                objectName: objectName,
                                displayName: line.key,
                                selector: selector,
                                properties: {
                                    fill: { solid: { color: line.color } }
                                }
                            });

                            this.addAnInstanceToEnumeration(instanceEnumeration, {
                                objectName: objectName,
                                displayName: `Type of line (${line.key})`,
                                properties: {
                                    lineType: line.type
                                },
                                selector: selector
                            })
                        })
                        break;
                    }
            }

            return instanceEnumeration || [];
        }

        private addAnInstanceToEnumeration(
            instanceEnumeration: VisualObjectInstanceEnumeration,
            instance: VisualObjectInstance): void {

            if ((instanceEnumeration as VisualObjectInstanceEnumerationObject).instances) {
                (instanceEnumeration as VisualObjectInstanceEnumerationObject)
                    .instances
                    .push(instance);
            } else {
                (instanceEnumeration as VisualObjectInstance[]).push(instance);
            }
        }

        private optionsIsCorrect(options: VisualUpdateOptions) {
            const categoryValues = <DataViewCategorical[]>_.get(options, "dataViews[0].categorical.categories[0].values");
            const values = <DataViewCategorical[]>_.get(options, "dataViews[0].categorical.values");
            const vluesIsFilled = values.every(v => { return !!v.values.length });

            return categoryValues && categoryValues.length && values && vluesIsFilled;
        }

        private clear() {
            this.svg.selectAll('*').remove();
            d3.selectAll(".nvtooltip").remove();
        }

        private getMultichartData(options: VisualUpdateOptions) {
            this.getRegionsData(options);
            this.getColumnsData(options);
        }

        private getColumnsData(options: VisualUpdateOptions) {
            this.multiChartElements = this.multiChartElements.filter(element => element.type !== "bar");

            let dataView = options.dataViews[0].categorical;

            let columnsValues = dataView.values.filter(function (v: any) { return v.source.roles["columnValues"] });
            let columns = [];

            if (columnsValues.length === 0) {
                return;
            }

            for (let i = 0; i < columnsValues.length; i++) {
                let currentValues = [];
                for (let j = 0; j < columnsValues[i].values.length; j++) {
                    let date = new Date(dataView.categories[0].values[j]);
                    let value = columnsValues[i].values[j] as number;
                    currentValues.push({ x: date.getTime(), y: value, categoryIndex: j });
                }
                let column = new Column(this.settings.columnsSettings.columnsColor, columnsValues[i].source.groupName as string, currentValues);
                columns.push(column);
            }

            // merge columns to one: calc average values
            let mergedColumnValues = [];
            for (var i = 0; i < dataView.categories[0].values.length; i++) {
                let date = dataView.categories[0].values[i];
                let value = 0;

                for (var j = 0; j < columns.length; j++) {
                    value += columns[j].values[i].y;
                }

                //value /= columns.length;  
                mergedColumnValues.push({ x: date, y: value, categoryIndex: i });
            }
            
            let mergedColumn = new Column(this.settings.columnsSettings.columnsColor, "Column values", mergedColumnValues);
            this.multiChartElements.push(mergedColumn);
        }

        private getRegionsData(options: VisualUpdateOptions) {
            this.multiChartElements = this.multiChartElements.filter(element => element.type !== "area");

            let dataView = options.dataViews[0].categorical;

            let regionValues: RegionData[] = [];

            for (let i = 1; i <= 5; i++) {
                let regionMinValues = dataView.values.filter(function (v: any) { return v.source.roles[`region${i}ValuesMin`] });
                let regionMaxValues = dataView.values.filter(function (v: any) { return v.source.roles[`region${i}ValuesMax`] });
              
                if (regionMinValues[0] && regionMaxValues[0]){   
                      
                    regionMinValues[0].values.forEach((value, i)=>
                    {   
                        if(regionMinValues[0].values[i] !== null && regionMinValues[0].values[i] > this.settings.axisesSettings.LeftYAxisMaxValue)
                            regionMinValues[0].values[i] = this.settings.axisesSettings.LeftYAxisMaxValue;
                        else if (regionMinValues[0].values[i] !== null && regionMinValues[0].values[i] < this.settings.axisesSettings.LeftYAxisMinValue)
                            regionMinValues[0].values[i] = this.settings.axisesSettings.LeftYAxisMinValue;
                        if(regionMaxValues[0].values[i] !== null && regionMaxValues[0].values[i] > this.settings.axisesSettings.LeftYAxisMaxValue)
                            regionMaxValues[0].values[i] = this.settings.axisesSettings.LeftYAxisMaxValue;
                        else if(regionMaxValues[0].values[i] !== null && regionMaxValues[0].values[i] < this.settings.axisesSettings.LeftYAxisMinValue)
                            regionMaxValues[0].values[i] = this.settings.axisesSettings.LeftYAxisMinValue;
                    });
                   
                    let regionData = new RegionData(regionMinValues[0].values, regionMaxValues[0].values, i);
                    regionValues.push(regionData);
                } else {
                    let categoriesLength = dataView.categories[0].values.length;
                    let regionValuesMin = Number(this.settings.regionsSettings[`region${i}ValuesMin`]);
                    let regionValuesMax = Number(this.settings.regionsSettings[`region${i}ValuesMax`]);
                    
                    let formatMinValue = 0;
                    if (regionValuesMin <= this.settings.axisesSettings.LeftYAxisMaxValue && regionValuesMin >= this.settings.axisesSettings.LeftYAxisMinValue)
                        formatMinValue = regionValuesMin;
                    else if (regionValuesMin >= this.settings.axisesSettings.LeftYAxisMaxValue)
                        formatMinValue = this.settings.axisesSettings.LeftYAxisMaxValue;
                    else if(regionValuesMin <= this.settings.axisesSettings.LeftYAxisMinValue)
                        formatMinValue = this.settings.axisesSettings.LeftYAxisMinValue;

                    let formatMaxValue = 0;
                    if (regionValuesMax <= this.settings.axisesSettings.LeftYAxisMaxValue && regionValuesMax >= this.settings.axisesSettings.LeftYAxisMinValue)
                        formatMaxValue = regionValuesMax;
                    else if (regionValuesMax >= this.settings.axisesSettings.LeftYAxisMaxValue)
                        formatMaxValue = this.settings.axisesSettings.LeftYAxisMaxValue;
                    else if(regionValuesMax <= this.settings.axisesSettings.LeftYAxisMinValue)
                        formatMaxValue = this.settings.axisesSettings.LeftYAxisMinValue;

                    let defaultRegionMinValues: PrimitiveValue[] = Array.apply(null, Array(categoriesLength)).map(item => formatMinValue);
                    let defaultRegionMaxValues: PrimitiveValue[] = Array.apply(null, Array(categoriesLength)).map(item => formatMaxValue);
                    let defaultRegion = new RegionData(defaultRegionMinValues, defaultRegionMaxValues, i);
                    regionValues.push(defaultRegion);
                }
            }

            // parse regions and gaps
            for (let i = 0; i < regionValues.length; i++) {
                let gap: Region = new Region(chartOptions.regionsOptions.gapColor, `gap - ${i}`);
                let region: Region = new Region(this.settings.regionsSettings[`region${regionValues[i].regionIndex}Color`], `region - ${i}`);
                region.index = regionValues[i].regionIndex;

                let calcFirstGap = i === 0;
                if (calcFirstGap) {
                    for (let j = 0; j < regionValues[i].minValues.length; j++) {
                        let date = +new Date(dataView.categories[0].values[j]);
                        let thickness = regionValues[i].minValues[j];
                        gap.values.push({ x: date, y: thickness, categoryIndex: j });
                    }
                } else {
                    for (let j = 0; j < regionValues[i].minValues.length; j++) {
                        let date = +new Date(dataView.categories[0].values[j]);
                        let thickness = +regionValues[i].minValues[j] - +regionValues[i - 1].maxValues[j];
                        gap.values.push({ x: date, y: thickness, categoryIndex: j });
                    }
                }

                let gapIsNotEmpty = gap.values.some(value => value.y !== 0);
                if (gap.values.some(value => value.y < 0))
                {
                    gap.color = "transparent";
                }
                if (gapIsNotEmpty) {
                    this.multiChartElements.push(gap);
                }

                for (let j = 0; j < regionValues[i].maxValues.length; j++) {
                    let date = +new Date(dataView.categories[0].values[j]);
                    let thickness = +regionValues[i].maxValues[j] - +regionValues[i].minValues[j];
                    region.values.push({ x: date, y: thickness, categoryIndex: j });
                }

                this.multiChartElements.push(region);
            }
        }

        private getLineChartData(options: VisualUpdateOptions) {
            var dataView = options.dataViews[0].categorical;
            let index: number = _.findIndex(options.dataViews[0].metadata.columns, col => col.roles.hasOwnProperty("legend"));
            let lineValuesIndex: number = _.findIndex(options.dataViews[0].metadata.columns, col => col.roles.hasOwnProperty("lineValues"));
            let lineValuesAmount = options.dataViews[0].metadata.columns.filter(col => col.roles.hasOwnProperty("lineValues")).length;
            let obj: {
                name: string; 
                columnGroup: DataViewValueColumnGroup; 
                selectionColumn: DataViewCategoryColumn;
            }[] = [];
            if(lineValuesIndex !== -1){
                let metaCategoryColumn: DataViewMetadataColumn = options.dataViews[0].metadata.columns[index];
                let groupValues = dataView.values ? dataView.values.grouped() : null;
                obj = groupValues.map((group: DataViewValueColumnGroup) => {
                    let column: DataViewCategoryColumn = {
                        identity: [group.identity],
                        source: {
                            displayName: null,
                            queryName: metaCategoryColumn?metaCategoryColumn.queryName:null
                        },
                        values: null
                    };      
                    return {
                        name: group ? group.name as string : null,
                        selectionColumn: column,
                        columnGroup: group
                    }
                });
            }
            let singleLineColor = null;
            let singleLineType = null;
            if(singleLineColor){
            var colorHelper: ColorHelper = new ColorHelper(this.colors,
                {
                    objectName: "linesSettings",
                    propertyName: "fill"
                },
                singleLineColor
            );}
            else
            {
            var colorHelper: ColorHelper = new ColorHelper(this.colors,
                {
                    objectName: "linesSettings",
                    propertyName: "fill"
                }
            );}

            let lines: ILine[] = obj.map((o) => { 
                let currentValues: IValue[] = o.columnGroup.values[0].values.map((value, i) => {
                    if(dataView.categories[0].values[i]){
                    let date = new Date(dataView.categories[0].values[i]);
                    if (value)
                        return { x: date.getTime(), y: value as number, categoryIndex: i };
                    }
                }).filter(value => value !== undefined);

                let singleLineType = options.dataViews[0].metadata && options.dataViews[0].metadata.objects && options.dataViews[0].metadata.objects["linesSettings"] ? options.dataViews[0].metadata.objects["linesSettings"]["lineType"]:chartOptions.lineType.solid;         
                
                if (lineValuesAmount === 1){
                    singleLineColor = options.dataViews[0].metadata && options.dataViews[0].metadata.objects && options.dataViews[0].metadata.objects["linesSettings"] && options.dataViews[0].metadata.objects["linesSettings"]["fill"] && options.dataViews[0].metadata.objects["linesSettings"]["fill"]["solid"] ? options.dataViews[0].metadata.objects["linesSettings"]["fill"]["solid"]["color"]:"#01B8AA";
                    singleLineType = options.dataViews[0].metadata && options.dataViews[0].metadata.objects && options.dataViews[0].metadata.objects["linesSettings"] ? options.dataViews[0].metadata.objects["linesSettings"]["lineType"]:chartOptions.lineType.solid;   
                }    

                let line: ILine = {
                    identity: this.host.createSelectionIdBuilder()
                            .withCategory(o.selectionColumn, 0)
                            .createSelectionId(),
                    color: singleLineColor ? this.getValue<string>(o.columnGroup.objects, "linesSettings", "fill",  singleLineColor ? singleLineColor:"#01B8AA") : colorHelper.getColorForMeasure(o.columnGroup.objects, o.name),
                    key: o.name,
                    strokeWidth: this.settings.linesSettings.linesWidth,
                    type: this.getValue<string>(o.columnGroup.objects, "linesSettings", "lineType", singleLineType ? singleLineType:chartOptions.lineType.solid),
                    values: currentValues
                };

                return line;
            });
        
            this.lines = lines;

            this.dateFormat = options.dataViews[0].categorical.categories[0].source.format;
        }

        private getValue<T>(objects: DataViewObjects, objectName: string, propertyName: string, defaultValue: any): T {
            if (objects) {
                let object = objects[objectName];
                if (object) {
                    let property: T = <T>object[propertyName];
                    if (property !== undefined) {
                        return property;
                    }
                }
            }
            return defaultValue;
        }

        private render(options: VisualUpdateOptions) {
            let linesDataExists = this.lines.length > 0;
            chartOptions.margin.bottom = this.setChartOptionsMargin(this.getXAxisTickMaxSize(options));
            chartOptions.margin.left = this.setChartOptionsMargin(this.getYAxisFormatted(options, this.settings.axisesSettings.LeftYAxisLabelPrecision));
            chartOptions.margin.right = this.setChartOptionsMargin(this.getYAxisFormatted(options, this.settings.axisesSettings.RightYAxisLabelPrecision));
            if (linesDataExists&&this.lines[0].key) {
                this.renderLegend();
                this.updateChartMargin();
            }

            let multichartDataExists = this.multiChartElements.length > 0;
            if (multichartDataExists) {
                this.renderMultiChart(options);
            }
            if (linesDataExists) {
                this.renderLinesChart(options);
            }

            this.svg.attr('width', this.viewport.width).attr('height', this.viewport.height);

            if (linesDataExists || multichartDataExists) {
                this.addComb();
                this.setLegendEvent();
            }
        }

        private renderLegend() {
            let legend: nv.Legend = this.nvd3.models.legend()
                .rightAlign(false)
                .height(this.viewport.height)
                .width(this.viewport.width);

            this.svg.datum(this.lines).call(legend);
        }

        private updateChartMargin() {
            let legendElement: any = this.svg.select(".nv-legend").node();
            if (legendElement) {
                let sizes = legendElement.getBBox();
                chartOptions.margin.top = sizes.height + 20;
            }
        }

        private getYAxisFormatted(options: VisualUpdateOptions, YAxisValue: any){
            const displayUnitsFormatter: IValueFormatter = valueFormatter.create({
                precision: this.settings.axisesSettings.RightYAxisLabelPrecision,
                value: this.settings.axisesSettings.RightYAxisLabelDisplayUnits
            });
            return displayUnitsFormatter.format(YAxisValue);
        }
        
        private getXAxisTickMaxSize(options: VisualUpdateOptions){
            this.dateFormat = this.dateFormat ? this.dateFormat : 'MM/DD/YYYY';
            let formatter = valueFormatter.create({format:this.dateFormat});
            var maxDateLenght=0;
            var maxDate=null;
            options.dataViews[0].categorical.categories[0].values.forEach(element =>{ let newDate = formatter.format(new Date(element));
                if (newDate.length > maxDateLenght){
                    maxDateLenght = newDate.length;
                    maxDate = newDate;
                }
            });
            return maxDate;
        }

        private renderMultiChart(options: VisualUpdateOptions) {
            let self = this;

            let YLeftAxisMinValue = this.settings.axisesSettings.LeftYAxisMinValue;
            let YLeftAxisMaxValue = this.settings.axisesSettings.LeftYAxisMaxValue;

            YLeftAxisMinValue = Math.min(YLeftAxisMinValue, YLeftAxisMaxValue );
            YLeftAxisMaxValue = Math.max(YLeftAxisMinValue, YLeftAxisMaxValue );

            let YRightAxisMinValue = this.settings.axisesSettings.RightYAxisMinValue;
            let YRightAxisMaxValue = this.settings.axisesSettings.RightYAxisMaxValue;

            YRightAxisMinValue = Math.min(YRightAxisMinValue,YRightAxisMaxValue );
            YRightAxisMaxValue = Math.max(YRightAxisMinValue,YRightAxisMaxValue );

            const displayUnitsFormatter: IValueFormatter = valueFormatter.create({
                precision: this.settings.axisesSettings.RightYAxisLabelPrecision,
                value: this.settings.axisesSettings.RightYAxisLabelDisplayUnits
            });

            this.dateFormat = this.dateFormat ? this.dateFormat : 'MM/DD/YYYY';
            let multiChart: nv.MultiChart = this.nvd3.models.multiChart()
                .margin(chartOptions.margin)    
                .x(function (d) { return d.categoryIndex})
                .y(function (d) { return d.y })
                .showLegend(false)
                .yDomain1([YLeftAxisMinValue,YLeftAxisMaxValue])
                .yDomain2([YRightAxisMinValue,YRightAxisMaxValue])
                .useVoronoi(false);
               
            let lineValuesIndex: number = _.findIndex(options.dataViews[0].metadata.columns, col => col.roles.hasOwnProperty("lineValues"));
            if (lineValuesIndex === -1){
                multiChart.xAxis
                .tickFormat(function (d) {
                    if (d === parseInt(d, 10)){
                        let date = new Date(options.dataViews[0].categorical.categories[0].values[d]);
                        let formatter = valueFormatter.create({format:self.dateFormat});
                        return formatter.format(date);
                    }
                })
                .rotateLabels(-90)
                .showMaxMin(false)
                .ticks(
                    this.viewport.width > 300 ? 
                    options.dataViews[0].categorical.categories[0].values.length < 15 ?
                    options.dataViews[0].categorical.categories[0].values.length: 15 :2);
            }
            else{
                multiChart.xAxis
                .tickValues(null)
                .showMaxMin(false)
                .ticks(0);
            }
            multiChart.yAxis1
                .tickValues(null)
                .showMaxMin(false)
                .ticks(0)
                .duration(0);

            multiChart.yAxis2
                .tickFormat(function (d){
                    return displayUnitsFormatter.format(d);
                })
                .showMaxMin(false)
                .ticks(10)
                .duration(0);

            multiChart.stack1.duration(0);
            multiChart.bars2.duration(0);
            multiChart.bars2.groupSpacing(0);
            multiChart.stack1.forceY([YLeftAxisMinValue,YLeftAxisMaxValue]);
            multiChart.stack1.padData(false);
            multiChart.tooltip.enabled(false);

            this.svg
                .datum(this.multiChartElements)
                .call(multiChart);

            let columnsExist = this.multiChartElements.some(element => element.type === "bar");

            if (columnsExist) {
                this.changeColumnsWidth();
            }
            let columnsSelection = this.svg.selectAll(".multiChart .nv-multibar .nv-bar");
            columnsSelection.filter(column => column.y == 0).attr('style', 'visibility: hidden ');
        }

        private changeLinesWidth(){
            let columnsSelection = this.svg.selectAll(".nvd3.nv-line .nvd3.nv-scatter .nv-groups .nv-point");
            let columnsWidthInPercents = this.settings.linesSettings.linesWidth > 7 ? 7 : this.settings.linesSettings.linesWidth;
            columnsSelection.attr('style', 'stroke-width:' + (columnsWidthInPercents + 2));
        }

        private changeColumnsWidth() {
            let columnChartBox: any = this.svg.select(".multiChart .nv-multibar defs rect").node();
            let chartBoxSizes = columnChartBox.getBBox();

            if (!chartBoxSizes) {
                return;
            }

            let chartOuterWidth = chartBoxSizes.width;
            let columnsSelection = this.svg.selectAll(".multiChart .nv-multibar .nv-bar");
            let x0 = +columnsSelection.attr("width");
            let columnsCount = columnsSelection[0].length;
            let chartInnerWidth = x0 * (columnsCount - 1);
            let x = chartInnerWidth / (columnsCount - 1);
            let columnsWidthInPercents = this.settings.columnsSettings.columnsWidth;
            let columnWidthInProp = columnsWidthInPercents / 100;
            let columnWidthInPx = x * columnWidthInProp;
            let gapWidth = x * (1 - columnWidthInProp);
            let extraGap = gapWidth/(columnsCount - 1);
            let translate = 0;
            columnsSelection
                .attr("transform", (d, i) => {
                    let attr = `translate(${translate}, 0)`;
                    translate += columnWidthInPx + gapWidth + extraGap;
                    return attr;
                })
                .attr("width", columnWidthInPx);
        }

        private setChartOptionsMargin(value: any) {
            //get width of date in current format
            var canvas = document.createElement('canvas');
            var ctx = canvas.getContext("2d");
            ctx.font = "11px Arial";        
            var dateWidth = ctx.measureText(value).width;
            return Math.max(dateWidth+40, 60)
        }

        private renderLinesChart(options: VisualUpdateOptions) {
            let self = this;

            let YAxisMinValue = this.settings.axisesSettings.LeftYAxisMinValue ? this.settings.axisesSettings.LeftYAxisMinValue: 0;
            let YAxisMaxValue = this.settings.axisesSettings.LeftYAxisMaxValue ? this.settings.axisesSettings.LeftYAxisMaxValue: 100;

            YAxisMinValue = Math.min(YAxisMinValue,YAxisMaxValue );
            YAxisMaxValue = Math.max(YAxisMinValue,YAxisMaxValue );

            const displayUnitsFormatter: IValueFormatter = valueFormatter.create({
                precision: this.settings.axisesSettings.LeftYAxisLabelPrecision,
                value: this.settings.axisesSettings.LeftYAxisLabelDisplayUnits
            });

            this.dateFormat = this.dateFormat ? this.dateFormat : 'MM/DD/YYYY';
            let lineChart: nv.LineChart = this.nvd3.models.lineChart()
                .duration(0)
                .margin(chartOptions.margin)
                .x(function (d) { return d.categoryIndex })
                .y(function (d) { return d.y })
                .yDomain([YAxisMinValue, YAxisMaxValue])
                .xScale(d3.scale.linear()) 
                .useVoronoi(false)
                .showLegend(false);
 
            lineChart.xAxis
                .tickFormat(function (d) {
                    if (d === parseInt(d, 10)){
                        let date = new Date(options.dataViews[0].categorical.categories[0].values[d]);
                        let formatter = valueFormatter.create({format:self.dateFormat});
                        return formatter.format(date);
                    }
                })
                .rotateLabels(-90)
                .showMaxMin(false)
                .ticks(this.viewport.width > 300 ? 
                    options.dataViews[0].categorical.categories[0].values.length < 15 ?
                    options.dataViews[0].categorical.categories[0].values.length: 15 :2)

                lineChart.lines.padData(false);

            lineChart.yAxis
                .tickFormat(function (d){
                    return displayUnitsFormatter.format(d);
                })
                .showMaxMin(false)
                .ticks(10);

            this.svg
                .datum(this.lines)
                .call(lineChart);

            this.addLineType();

            this.changeLinesWidth();
        }

        private addComb() {            
            let self = this;
            var xTicks = this.svg.selectAll(".nv-x .tick")
            xTicks.select("line").remove();
            xTicks.append("line")
                .attr("x2", 0)
                .attr("y2", this.constants.tickSize);

            var yTicks = this.svg.selectAll(".nv-y .tick")
            yTicks.select("line").remove();
            yTicks.append("line")
                .attr("x2", -this.constants.tickSize)
                .attr("y2", 0);
            yTicks.select("text").attr('transform', function () { return 'translate(' + -self.constants.tickSize + ', 0)' })

            var yTicks2 = this.svg.selectAll(".nv-y2 .tick")
            yTicks2.select("line").remove();
            yTicks2.append("line")
                .attr("x2", this.constants.tickSize)
                .attr("y2", 0);
            yTicks2.select("text").attr('transform', function () { return 'translate(' + self.constants.tickSize + ', 0)' })
        }

        private setLegendEvent() {            
            this.svg.selectAll('.nv-legend').attr("transform", "translate(" + 50 +")");
            var series = this.svg.selectAll('.nv-series');
            series.on('click', function () { });
            series.on('dblclick', function () { })
        }

        private addLineType() {            
            this.lines.forEach((line, i) => {
                let path = this.svg.selectAll(`.nv-lineChart .nv-series-${i} path`);
                
                switch(line.type) {
                    case chartOptions.lineType.dotted: {
                        path.attr("stroke-dasharray", "1, 15")
                        .attr("stroke-linecap", "round")
                        break;
                    }
                    case chartOptions.lineType.dashed: {
                        path.attr("stroke-dasharray", "15, 15")
                        .attr("stroke-linecap", "round")
                        break;
                    }
                    case chartOptions.lineType.dashDot: {
                        path.attr("stroke-dasharray", "10, 10, 1, 10")
                        .attr("stroke-linecap", "round")
                        break;
                    }
                }
            })
        }
    }
}
